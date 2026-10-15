// Column layout of RunlyForm: main sections plus an optional aside column
// (completion ring, quick actions, preview, aside attachments).
//
// Below xl both columns are flattened (`display: contents`) into one grid so
// every block can be ordered: the aside header first, then the main sections
// in order, and an aside section with `mobileAfter: "<section id>"` right
// after that section instead of after all of them. From xl up the columns sit
// side by side and the order props are ignored.
const MOBILE_ORDER = "order-(--mobile-order) xl:order-none";

export function FormColumns({ main, asideTop = null, aside = [] }) {
  const hasAside = Boolean(asideTop) || aside.length > 0;
  if (!hasAside) return <div className="space-y-3">{main.map((item) => <div key={item.id}>{item.node}</div>)}</div>;

  const mainOrder = new Map(main.map((item, index) => [item.id, (index + 1) * 10]));
  const asideOrder = (item) => (item.mobileAfter && mainOrder.has(item.mobileAfter) ? mainOrder.get(item.mobileAfter) + 5 : 1);
  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="contents xl:block xl:space-y-3">
        {main.map((item) => (
          <div key={item.id} className={MOBILE_ORDER} style={{ "--mobile-order": mainOrder.get(item.id) }}>{item.node}</div>
        ))}
      </div>
      <div className="contents xl:sticky xl:top-4 xl:block xl:space-y-3 xl:self-start">
        {asideTop ? <div className={`space-y-3 ${MOBILE_ORDER}`} style={{ "--mobile-order": 0 }}>{asideTop}</div> : null}
        {aside.map((item) => (
          <div key={item.id} className={MOBILE_ORDER} style={{ "--mobile-order": asideOrder(item) }}>{item.node}</div>
        ))}
      </div>
    </div>
  );
}
