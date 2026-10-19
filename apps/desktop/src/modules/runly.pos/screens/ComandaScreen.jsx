import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { ChefHat, CreditCard, Receipt, AlertTriangle } from "lucide-react";
import { PageHeader, Button, Alert, AlertTitle, AlertDescription } from "@runly/ui";
import {
  usePosOrders,
  usePosOrder,
  useCreatePosOrder,
  useClaimOrder,
  useAddPosOrderLine,
  useAddPosGuest,
  useSendToKitchen,
} from "../hooks/usePosOrder";
import { usePosFloors, usePosFloorDetail, useUpdateTableStatus } from "../hooks/usePosFloor";
import { usePosOutlets } from "../hooks/usePosSettings";
import { usePosCatalogProducts } from "../hooks/usePosCatalog";
import { useModifierGroupsByProducts } from "../hooks/usePosModifiers";
import ProductGrid from "../components/ProductGrid";
import SeatChips from "../components/SeatChips";
import ComandaLineList from "../components/ComandaLineList";
import LineEditSheet from "../components/LineEditSheet";
import ModifierSheet from "../components/ModifierSheet";
import PaymentDialog from "../components/PaymentDialog";

// Orders in these statuses can no longer be edited — mirrors assertEditableOrder
// in apps/api/src/routes/pos/service-helpers.js.
const NON_EDITABLE_STATUSES = ["PAID", "CANCELLED", "REFUNDED"];
const ACTIVE_ORDER_STATUSES = ["OPEN", "SENT", "PARTIALLY_SERVED", "SERVED"];

// F2-B mobile comanda editor: seats -> products (with modifiers, Task 5) -> cocina -> cobro.
export default function ComandaScreen() {
  const { "*": wildcard } = useParams();
  const tableId = useMemo(() => (wildcard ?? "").split("/")[3] ?? null, [wildcard]);

  const [activeSeatId, setActiveSeatId] = useState(null);
  const [editingLine, setEditingLine] = useState(null);
  const [modifierSheetProduct, setModifierSheetProduct] = useState(null);
  const [payOpen, setPayOpen] = useState(false);
  const [localOrderId, setLocalOrderId] = useState(null);

  // Resolve the table's outlet/floor the same way PosTablesScreen defaults when
  // no outlet has been explicitly picked yet (single-outlet dev reality today;
  // a future multi-outlet deep-link would need the outlet passed via route state).
  const { data: outlets = [] } = usePosOutlets();
  const effectiveOutletId = outlets[0]?.id || "";
  const { data: floors = [] } = usePosFloors(effectiveOutletId ? { outletId: effectiveOutletId } : {});
  const defaultFloor = floors.find((f) => f.isActive) ?? floors[0];
  const { data: floorDetail } = usePosFloorDetail(defaultFloor?.id, { refetch: true });
  const table = useMemo(() => floorDetail?.tables?.find((t) => t.id === tableId) ?? null, [floorDetail, tableId]);

  // Same active-order lookup as PosTablesScreen.navigateToOrder: no tableId
  // filter exists on the list endpoint, so scan active statuses client-side.
  const { data: openOrders = [] } = usePosOrders({ status: "OPEN" });
  const { data: sentOrders = [] } = usePosOrders({ status: "SENT" });
  const { data: partialOrders = [] } = usePosOrders({ status: "PARTIALLY_SERVED" });
  const { data: servedOrders = [] } = usePosOrders({ status: "SERVED" });
  const activeOrders = useMemo(
    () => [...openOrders, ...sentOrders, ...partialOrders, ...servedOrders],
    [openOrders, sentOrders, partialOrders, servedOrders],
  );
  const existingOrder = useMemo(() => activeOrders.find((o) => o.tableId === tableId) ?? null, [activeOrders, tableId]);
  const orderId = existingOrder?.id ?? localOrderId;
  const { data: order } = usePosOrder(orderId);

  // Resuming an existing order used to never re-assert OCCUPIED + waiterId on
  // its table, so a table that had drifted back to AVAILABLE stayed stuck that
  // way while its order kept being worked on. Fire once per resumed order id.
  const claimedOrderIdRef = useRef(null);
  useEffect(() => {
    if (!existingOrder?.id || claimedOrderIdRef.current === existingOrder.id) return;
    claimedOrderIdRef.current = existingOrder.id;
    claimOrder.mutate(existingOrder.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingOrder?.id]);

  const readOnly = order ? NON_EDITABLE_STATUSES.includes(order.status) : false;

  const createOrder = useCreatePosOrder();
  const claimOrder = useClaimOrder();
  const addLine = useAddPosOrderLine();
  const addGuest = useAddPosGuest();
  const sendToKitchen = useSendToKitchen();
  const updateTableStatus = useUpdateTableStatus();

  const { data: catalogProducts = [] } = usePosCatalogProducts();
  const productIds = useMemo(() => catalogProducts.map((p) => p.id), [catalogProducts]);
  const { data: modifierGroupsMap = {} } = useModifierGroupsByProducts(productIds);

  const currentOutlet = useMemo(
    () => outlets.find((o) => o.id === (order?.outletId ?? effectiveOutletId)),
    [outlets, order, effectiveOutletId],
  );
  const allowTableCharge = Boolean(currentOutlet?.allowTableCharge);

  const ensureOrderId = useCallback(async () => {
    if (orderId) return orderId;
    if (!effectiveOutletId || !tableId) {
      toast.error("No se encontró la sucursal para esta mesa.");
      return null;
    }
    try {
      const res = await createOrder.mutateAsync({ outletId: effectiveOutletId, tableId, fulfillmentType: "DINE_IN" });
      const newId = (res?.data ?? res)?.id ?? null;
      if (newId) setLocalOrderId(newId);
      return newId;
    } catch {
      return null;
    }
  }, [orderId, effectiveOutletId, tableId, createOrder]);

  async function addProductLine(product) {
    const oid = await ensureOrderId();
    if (!oid) return;
    const unitPrice = parseFloat(product.price ?? product.base_price ?? 0);
    addLine.mutate({
      orderId: oid,
      productId: product.id,
      productName: product.name,
      unitPrice,
      quantity: 1,
      guestSeatId: activeSeatId,
    });
  }

  function handleProductTap(product) {
    if (readOnly) return;
    const groups = modifierGroupsMap?.[product.id];
    if (Array.isArray(groups) && groups.length > 0) {
      setModifierSheetProduct(product);
      return;
    }
    addProductLine(product);
  }

  async function handleModifierSubmit({ modifiers, quantity, note, guestSeatId }) {
    const product = modifierSheetProduct;
    if (!product) return;
    const oid = await ensureOrderId();
    if (!oid) return;
    const unitPrice = parseFloat(product.price ?? product.base_price ?? 0);
    addLine.mutate(
      { orderId: oid, productId: product.id, productName: product.name, unitPrice, quantity, note, guestSeatId, modifiers },
      { onSuccess: () => setModifierSheetProduct(null) },
    );
  }

  async function handleAddGuest() {
    if (readOnly) return;
    const oid = await ensureOrderId();
    if (!oid) return;
    const nextIndex = (order?.guests?.length ?? 0) + 1;
    addGuest.mutate({ orderId: oid, label: `Persona ${nextIndex}` });
  }

  function handleSendToKitchen() {
    if (!orderId || readOnly) return;
    sendToKitchen.mutate(orderId);
  }

  function handleRequestBill() {
    if (!table?.id || readOnly) return;
    updateTableStatus.mutate({ tableId: table.id, status: "BILL_REQUESTED" });
  }

  const lineCount = order?.lines?.length ?? 0;
  const sendDisabled = !orderId || readOnly || lineCount === 0 || sendToKitchen.isPending;

  if (!tableId) {
    return (
      <div className="flex h-full flex-col bg-background">
        <PageHeader title="Comanda" description="Mesa no especificada." />
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col bg-background">
      <div className="shrink-0 px-3 pt-3">
        <PageHeader
          compact
          title={table?.name || "Mesa"}
          actions={
            !orderId ? (
              <Button size="sm" variant="outline" onClick={() => ensureOrderId()} disabled={createOrder.isPending}>
                Iniciar comanda
              </Button>
            ) : undefined
          }
        />
      </div>

      {readOnly && (
        <div className="shrink-0 px-3 pb-2">
          <Alert variant="warning">
            <AlertTriangle size={16} />
            <AlertTitle>Orden no editable</AlertTitle>
            <AlertDescription>
              Esta orden está en estado {order?.status} y ya no admite cambios.
            </AlertDescription>
          </Alert>
        </div>
      )}

      <div className="shrink-0 border-b border-border px-2">
        <SeatChips
          guests={order?.guests ?? []}
          activeSeatId={activeSeatId}
          onSelect={setActiveSeatId}
          onAddGuest={handleAddGuest}
          addingGuest={addGuest.isPending || createOrder.isPending || readOnly}
        />
      </div>

      <div className="shrink-0 max-h-[35vh] overflow-y-auto border-b border-border px-3 py-3">
        <ComandaLineList order={order} onEditLine={(line) => !readOnly && setEditingLine(line)} />
      </div>

      <div className="min-h-0 flex-1">
        <ProductGrid onSelect={handleProductTap} />
      </div>

      <div className="flex shrink-0 items-center gap-3 border-t border-border bg-card/95 px-4 py-3 pb-[var(--sab)] backdrop-blur">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-lg font-bold tabular-nums">${parseFloat(order?.totalAmount ?? 0).toFixed(2)}</p>
        </div>
        <Button variant="outline" onClick={handleSendToKitchen} disabled={sendDisabled} className="gap-1.5">
          <ChefHat size={16} />
          <span className="hidden sm:inline">Enviar a cocina</span>
        </Button>
        {allowTableCharge ? (
          <Button onClick={() => setPayOpen(true)} disabled={!orderId || readOnly} className="gap-1.5">
            <CreditCard size={16} />
            Cobrar
          </Button>
        ) : (
          <Button onClick={handleRequestBill} disabled={!table?.id || readOnly || updateTableStatus.isPending} className="gap-1.5">
            <Receipt size={16} />
            Pedir cuenta
          </Button>
        )}
      </div>

      <LineEditSheet
        line={editingLine}
        orderId={orderId}
        open={Boolean(editingLine)}
        onOpenChange={(v) => !v && setEditingLine(null)}
        guests={order?.guests ?? []}
      />

      <ModifierSheet
        open={Boolean(modifierSheetProduct)}
        onOpenChange={(v) => !v && setModifierSheetProduct(null)}
        product={modifierSheetProduct}
        groups={modifierSheetProduct ? (modifierGroupsMap?.[modifierSheetProduct.id] ?? []) : []}
        guests={order?.guests ?? []}
        activeSeatId={activeSeatId}
        onSubmit={handleModifierSubmit}
        submitting={addLine.isPending}
      />

      {order && (
        <PaymentDialog open={payOpen} onOpenChange={setPayOpen} order={order} onSuccess={() => setPayOpen(false)} />
      )}
    </div>
  );
}
