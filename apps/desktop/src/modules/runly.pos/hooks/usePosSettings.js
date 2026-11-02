import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '../../../auth/AuthProvider'
import { runly } from '../../../lib/runly'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider'
import { selectPosSettings } from '../lib/posSettings.js'

function useScope() {
  const { session } = useAuth()
  const { activeCompanyId } = useActiveCompany()
  return { token:session?.access_token, companyId:activeCompanyId }
}

export function usePosSettings() {
  const {token,companyId} = useScope()
  return useQuery({
    queryKey: ['pos', 'settings', companyId, token],
    queryFn: () => runly.pos.getSettings(token),
    // The API wraps the row in { data }; screens read the settings themselves.
    select: selectPosSettings,
    enabled: Boolean(token && companyId),
    staleTime: 5 * 60 * 1000,
  })
}

export function useUpdatePosSettings() {
  const {token,companyId} = useScope()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => runly.pos.updateSettings(data, token),
    onMutate: () => ({ toastId: toast.loading('Guardando configuración...') }),
    onSuccess: (result, __, ctx) => {
      toast.dismiss(ctx?.toastId)
      toast.success('Configuración guardada')
      qc.setQueryData(['pos','settings',companyId,token],result)
      qc.invalidateQueries({ queryKey: ['pos', 'settings'] })
    },
    onError: (err, __, ctx) => {
      toast.dismiss(ctx?.toastId)
      toast.error(err?.message ?? 'Error al guardar')
    },
  })
}

export function usePosOutlets() {
  const {token,companyId} = useScope()
  return useQuery({
    queryKey: ['pos', 'outlets', companyId, token],
    queryFn: () => runly.pos.listOutlets(token),
    select: (res) => Array.isArray(res) ? res : (res?.data ?? []),
    enabled: Boolean(token && companyId),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreatePosOutlet() {
  const {token} = useScope()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => runly.pos.createOutlet(data, token),
    onMutate: () => ({ toastId: toast.loading('Creando sucursal...') }),
    onSuccess: (_, __, ctx) => {
      toast.dismiss(ctx?.toastId)
      toast.success('Sucursal creada')
      qc.invalidateQueries({ queryKey: ['pos', 'outlets'] })
      qc.invalidateQueries({ queryKey: ['pos-nav-modes'] })
      qc.invalidateQueries({ queryKey: ['pos-retail-context'] })
    },
    onError: (err, __, ctx) => {
      toast.dismiss(ctx?.toastId)
      toast.error(err?.message ?? 'Error al crear sucursal')
    },
  })
}

export function useUpdatePosOutlet() {
  const {token} = useScope()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => runly.pos.updateOutlet(id, data, token),
    onMutate: () => ({ toastId: toast.loading('Guardando sucursal...') }),
    onSuccess: (_, __, ctx) => {
      toast.dismiss(ctx?.toastId)
      toast.success('Sucursal actualizada')
      qc.invalidateQueries({ queryKey: ['pos', 'outlets'] })
      qc.invalidateQueries({ queryKey: ['pos-nav-modes'] })
      qc.invalidateQueries({ queryKey: ['pos-retail-context'] })
    },
    onError: (err, __, ctx) => {
      toast.dismiss(ctx?.toastId)
      toast.error(err?.message ?? 'Error al guardar sucursal')
    },
  })
}

export function usePosTerminals() {
  const {token,companyId} = useScope()
  return useQuery({
    queryKey: ['pos', 'terminals', companyId, token],
    queryFn: () => runly.pos.listTerminals(token),
    select: (res) => Array.isArray(res) ? res : (res?.data ?? []),
    enabled: Boolean(token && companyId),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreatePosTerminal() {
  const {token} = useScope()
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
  const {token} = useScope()
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
  const {token,companyId} = useScope()
  return useQuery({
    queryKey: ['pos', 'payment-methods', companyId, token],
    queryFn: () => runly.pos.listPaymentMethods(token),
    select: (res) => Array.isArray(res) ? res : (res?.data ?? []),
    enabled: Boolean(token && companyId),
    staleTime: 10 * 60 * 1000,
  })
}

export function useCreatePosPaymentMethod() {
  const {token} = useScope()
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
  const {token} = useScope()
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
  const {token,companyId} = useScope()
  return useQuery({
    queryKey: ['pos', 'stations', companyId, token, query],
    queryFn: () => runly.pos.listStations(query, token),
    select: (res) => Array.isArray(res) ? res : (res?.data ?? []),
    enabled: Boolean(token && companyId),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreatePosStation() {
  const {token} = useScope()
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
  const {token} = useScope()
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
