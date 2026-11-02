import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '../../../auth/AuthProvider'
import { runly } from '../../../lib/runly'

function useToken() {
  const { session } = useAuth()
  return session?.access_token
}

export function usePosSettings() {
  const token = useToken()
  return useQuery({
    queryKey: ['pos', 'settings'],
    queryFn: () => runly.pos.getSettings(token),
    // The API wraps the row in { data }; screens read the settings themselves.
    select: (res) => res?.data ?? res,
    enabled: Boolean(token),
    staleTime: 5 * 60 * 1000,
  })
}

export function useUpdatePosSettings() {
  const token = useToken()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => runly.pos.updateSettings(data, token),
    onMutate: () => ({ toastId: toast.loading('Guardando configuración...') }),
    onSuccess: (_, __, ctx) => {
      toast.dismiss(ctx?.toastId)
      toast.success('Configuración guardada')
      qc.invalidateQueries({ queryKey: ['pos', 'settings'] })
    },
    onError: (err, __, ctx) => {
      toast.dismiss(ctx?.toastId)
      toast.error(err?.message ?? 'Error al guardar')
    },
  })
}

export function usePosOutlets() {
  const token = useToken()
  return useQuery({
    queryKey: ['pos', 'outlets'],
    queryFn: () => runly.pos.listOutlets(token),
    select: (res) => Array.isArray(res) ? res : (res?.data ?? []),
    enabled: Boolean(token),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreatePosOutlet() {
  const token = useToken()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => runly.pos.createOutlet(data, token),
    onMutate: () => ({ toastId: toast.loading('Creando sucursal...') }),
    onSuccess: (_, __, ctx) => {
      toast.dismiss(ctx?.toastId)
      toast.success('Sucursal creada')
      qc.invalidateQueries({ queryKey: ['pos', 'outlets'] })
    },
    onError: (err, __, ctx) => {
      toast.dismiss(ctx?.toastId)
      toast.error(err?.message ?? 'Error al crear sucursal')
    },
  })
}

export function useUpdatePosOutlet() {
  const token = useToken()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => runly.pos.updateOutlet(id, data, token),
    onMutate: () => ({ toastId: toast.loading('Guardando sucursal...') }),
    onSuccess: (_, __, ctx) => {
      toast.dismiss(ctx?.toastId)
      toast.success('Sucursal actualizada')
      qc.invalidateQueries({ queryKey: ['pos', 'outlets'] })
    },
    onError: (err, __, ctx) => {
      toast.dismiss(ctx?.toastId)
      toast.error(err?.message ?? 'Error al guardar sucursal')
    },
  })
}

export function usePosTerminals() {
  const token = useToken()
  return useQuery({
    queryKey: ['pos', 'terminals'],
    queryFn: () => runly.pos.listTerminals(token),
    select: (res) => Array.isArray(res) ? res : (res?.data ?? []),
    enabled: Boolean(token),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreatePosTerminal() {
  const token = useToken()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => runly.pos.createTerminal(data, token),
    onMutate: () => ({ toastId: toast.loading('Creando terminal...') }),
    onSuccess: (_, __, ctx) => {
      toast.dismiss(ctx?.toastId)
      toast.success('Terminal creada')
      qc.invalidateQueries({ queryKey: ['pos', 'terminals'] })
    },
    onError: (err, __, ctx) => {
      toast.dismiss(ctx?.toastId)
      toast.error(err?.message ?? 'Error al crear terminal')
    },
  })
}

export function useUpdatePosTerminal() {
  const token = useToken()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => runly.pos.updateTerminal(id, data, token),
    onMutate: () => ({ toastId: toast.loading('Guardando terminal...') }),
    onSuccess: (_, __, ctx) => {
      toast.dismiss(ctx?.toastId)
      toast.success('Terminal actualizada')
      qc.invalidateQueries({ queryKey: ['pos', 'terminals'] })
    },
    onError: (err, __, ctx) => {
      toast.dismiss(ctx?.toastId)
      toast.error(err?.message ?? 'Error al guardar terminal')
    },
  })
}

export function usePosPaymentMethods() {
  const token = useToken()
  return useQuery({
    queryKey: ['pos', 'payment-methods'],
    queryFn: () => runly.pos.listPaymentMethods(token),
    select: (res) => Array.isArray(res) ? res : (res?.data ?? []),
    enabled: Boolean(token),
    staleTime: 10 * 60 * 1000,
  })
}

export function useCreatePosPaymentMethod() {
  const token = useToken()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => runly.pos.createPaymentMethod(data, token),
    onMutate: () => ({ toastId: toast.loading('Creando método de pago...') }),
    onSuccess: (_, __, ctx) => {
      toast.dismiss(ctx?.toastId)
      toast.success('Método de pago creado')
      qc.invalidateQueries({ queryKey: ['pos', 'payment-methods'] })
    },
    onError: (err, __, ctx) => {
      toast.dismiss(ctx?.toastId)
      toast.error(err?.message ?? 'Error al crear método de pago')
    },
  })
}

export function useUpdatePosPaymentMethod() {
  const token = useToken()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => runly.pos.updatePaymentMethod(id, data, token),
    onMutate: () => ({ toastId: toast.loading('Guardando...') }),
    onSuccess: (_, __, ctx) => {
      toast.dismiss(ctx?.toastId)
      toast.success('Método de pago actualizado')
      qc.invalidateQueries({ queryKey: ['pos', 'payment-methods'] })
    },
    onError: (err, __, ctx) => {
      toast.dismiss(ctx?.toastId)
      toast.error(err?.message ?? 'Error al actualizar')
    },
  })
}

export function usePosStations(query = {}) {
  const token = useToken()
  return useQuery({
    queryKey: ['pos', 'stations', query],
    queryFn: () => runly.pos.listStations(query, token),
    select: (res) => Array.isArray(res) ? res : (res?.data ?? []),
    enabled: Boolean(token),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreatePosStation() {
  const token = useToken()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => runly.pos.createStation(data, token),
    onMutate: () => ({ toastId: toast.loading('Creando estación...') }),
    onSuccess: (_, __, ctx) => {
      toast.dismiss(ctx?.toastId)
      toast.success('Estación creada')
      qc.invalidateQueries({ queryKey: ['pos', 'stations'] })
    },
    onError: (err, __, ctx) => {
      toast.dismiss(ctx?.toastId)
      toast.error(err?.message ?? 'Error al crear estación')
    },
  })
}

export function useUpdatePosStation() {
  const token = useToken()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => runly.pos.updateStation(id, data, token),
    onMutate: () => ({ toastId: toast.loading('Guardando estación...') }),
    onSuccess: (_, __, ctx) => {
      toast.dismiss(ctx?.toastId)
      toast.success('Estación actualizada')
      qc.invalidateQueries({ queryKey: ['pos', 'stations'] })
    },
    onError: (err, __, ctx) => {
      toast.dismiss(ctx?.toastId)
      toast.error(err?.message ?? 'Error al guardar estación')
    },
  })
}
