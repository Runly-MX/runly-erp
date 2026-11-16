import { test } from 'node:test'
import assert from 'node:assert/strict'
import { advanceIfDue, elapsedOf, goTo, motionTime, next, previous, restartClock, setLoop, setPlaying, startPresentation } from './presentation-state.js'
import { frameScale } from './slide-frames.js'

test('manual navigation clamps without loop and wraps with loop', () => {
  let state = startPresentation({ count: 3, index: 5, now: 0 })
  assert.equal(state.index, 2)
  state = next(state, 10); assert.equal(state.index, 2)
  state = previous(state, 20); assert.deepEqual([state.index, state.direction], [1, -1])
  state = setLoop(goTo(state, 2, 30), true)
  state = next(state, 40); assert.deepEqual([state.index, state.direction], [0, 1])
  state = previous(state, 50); assert.deepEqual([state.index, state.direction], [2, -1])
})

test('autoplay uses wall-clock elapsed time, pauses without drift and stops at the end', () => {
  let state = setPlaying(startPresentation({ count: 2, now: 1000 }), true, 1000)
  assert.equal(advanceIfDue(state, 5999, 5000), state)
  state = setPlaying(state, false, 3000); assert.equal(elapsedOf(state, 99_000), 2000)
  state = setPlaying(state, true, 10_000)
  assert.equal(advanceIfDue(state, 12_999, 5000).index, 0)
  state = advanceIfDue(state, 13_000, 5000); assert.deepEqual([state.index, elapsedOf(state, 13_000)], [1, 0])
  state = advanceIfDue(state, 18_000, 5000)
  assert.deepEqual([state.index, state.playing, state.ended], [1, false, true])
  state = setPlaying(state, true, 20_000); assert.deepEqual([state.index, state.playing, state.ended], [0, true, false], 'play after the end restarts')
})

test('looping autoplay wraps and a frame load restarts the slide clock', () => {
  let state = setPlaying(setLoop(startPresentation({ count: 2, index: 1, now: 0 }), true), true, 0)
  state = advanceIfDue(state, 3000, 3000); assert.equal(state.index, 0)
  state = restartClock(state, 4000); assert.equal(advanceIfDue(state, 6999, 3000).index, 0)
})

test('frame scale fits the stage, honours pixel ratio and export bounds', () => {
  assert.equal(frameScale({ width: 1920, height: 1080 }, { width: 960, height: 1000 }, 1), 0.5)
  assert.equal(frameScale({ width: 1920, height: 1080 }, { width: 960, height: 1000 }, 2), 1)
  assert.equal(frameScale({ width: 4096, height: 4096 }, { width: 360, height: 640 }, 3), 0.25)
  assert.equal(frameScale({ width: 400, height: 400 }, { width: 1920, height: 1080 }, 2), 4, 'small pages fill the stage, capped')
  assert.equal(frameScale({ width: 1080, height: 1080 }, { width: 1920, height: 1080 }, 1), 1)
})

test('the animation clock runs without autoplay, freezes on pause and restarts per slide', () => {
  let state = startPresentation({ count: 3, now: 0 })
  assert.equal(motionTime(state, 1200), 1200, 'animations run in manual mode')
  state = setPlaying(state, true, 1500); assert.equal(motionTime(state, 2000), 2000)
  state = setPlaying(state, false, 2500); assert.equal(motionTime(state, 9000), 2500, 'pause freezes the animation')
  state = setPlaying(state, true, 10_000); assert.equal(motionTime(state, 10_400), 2900, 'resume continues without a jump')
  state = next(state, 11_000); assert.equal(motionTime(state, 11_250), 250, 'a new slide starts at 0')
  state = restartClock(setPlaying(state, false, 11_500), 12_000); assert.equal(motionTime(state, 12_100), 100, 'a revealed slide always runs')
})
