"""Deterministic Resource Governor tests: no cgroups, no clock, no I/O."""
import unittest
from worker import governor_decision, next_cpu_debt

GB = 1 << 30
OK = dict(limit=4 * GB, used=1 * GB, cpu=2.0, free_tmp=5 * GB, cpu_percent=30, cpu_debt=0, cpu_budget=80)


def decide(was_resource=False, was_cpu=False, **over):
    return governor_decision(**{**OK, **over}, was_resource_paused=was_resource, was_cpu_paused=was_cpu)


class Governor(unittest.TestCase):
    def test_ready(self):
        self.assertEqual(decide(), (False, False, 'ready'))

    def test_missing_limits_fail_closed(self):
        self.assertEqual(decide(limit=None)[2], 'no-limits')
        self.assertEqual(decide(cpu=None)[2], 'no-limits')

    def test_disk_full(self):
        self.assertEqual(decide(free_tmp=10_000_000), (True, False, 'disk'))

    def test_memory_hysteresis(self):
        self.assertTrue(decide(used=int(3.3 * GB))[0])                          # >80%
        self.assertFalse(decide(used=int(2.9 * GB), was_resource=False)[0])     # 72%, was ready
        self.assertTrue(decide(used=int(2.9 * GB), was_resource=True)[0])       # still >65% while paused
        self.assertFalse(decide(used=int(2.5 * GB), was_resource=True)[0])      # recovered <65%

    def test_cpu_hysteresis_and_unavailable_metrics(self):
        self.assertEqual(decide(cpu_percent=95)[1:], (True, 'cpu'))
        self.assertFalse(decide(cpu_percent=70, was_cpu=False)[1])
        self.assertTrue(decide(cpu_percent=70, was_cpu=True)[1])                # resume only below 80% of budget
        self.assertFalse(decide(cpu_percent=None)[1])                           # unreadable metric invents no load

    def test_debt_pauses_then_repays(self):
        self.assertEqual(decide(cpu_debt=2.0)[1:], (True, 'cpu'))
        debt = next_cpu_debt(0, 200, 100, 10)                                   # 2x budget for 10 s owes 10 s
        self.assertAlmostEqual(debt, 10)
        self.assertAlmostEqual(next_cpu_debt(debt, 0, 100, 10), 0)              # idle repays it
        self.assertEqual(next_cpu_debt(5, None, 100, 10), 5)                    # no metric: debt unchanged

    def test_container_smaller_than_requested(self):
        # The cgroup limit governs even when the admin requested more.
        self.assertEqual(decide(limit=GB, used=int(.9 * GB))[2], 'memory')


if __name__ == '__main__':
    unittest.main()
