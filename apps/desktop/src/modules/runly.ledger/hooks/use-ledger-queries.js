import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useOfflineContext, useOfflineStatus } from '@runly/offline'
import { useAuth } from '../../../auth/AuthProvider'
import { createLedgerDataClient } from '../lib/ledger-data-client.js'

const ledgerClient = createLedgerDataClient()

function useLedgerRuntime() {
  const { session } = useAuth()
  const offlineContext = useOfflineContext()
  const { isOnline, lastSyncAt } = useOfflineStatus()

  const token = session?.access_token ?? null
  const cachedLedgerStore = offlineContext?.ledgerStoreRef?.current ?? null
  const isLedgerCacheReady = Boolean(cachedLedgerStore)
  const isUsingLocalLedger = !isOnline && isLedgerCacheReady

  return {
    token,
    isOnline,
    lastSyncAt,
    cachedLedgerStore,
    localLedgerStore: isUsingLocalLedger ? cachedLedgerStore : null,
    isLedgerCacheReady,
    isUsingLocalLedger,
  }
}

export function useLedgerSQLite() {
  const runtime = useLedgerRuntime()

  return {
    ledgerStore: runtime.cachedLedgerStore,
    isLedgerCacheReady: runtime.isLedgerCacheReady,
    isUsingLocalLedger: runtime.isUsingLocalLedger,
    isOnline: runtime.isOnline,
    lastSyncAt: runtime.lastSyncAt,
  }
}

export function useAccountList() {
  const { token, localLedgerStore, isUsingLocalLedger } = useLedgerRuntime()

  return useQuery({
    queryKey: ['ledger-accounts', isUsingLocalLedger ? 'local' : 'remote', token],
    queryFn: () => ledgerClient.listAccounts({ token, ledgerStore: localLedgerStore }),
    enabled: Boolean(token || localLedgerStore),
    staleTime: 60 * 1000,
  })
}

export function useAccount(accountId) {
  const { token, localLedgerStore, isUsingLocalLedger } = useLedgerRuntime()

  return useQuery({
    queryKey: ['ledger-account', accountId, isUsingLocalLedger ? 'local' : 'remote'],
    queryFn: () => ledgerClient.getAccount({ accountId, token, ledgerStore: localLedgerStore }),
    enabled: Boolean(accountId && (token || localLedgerStore)),
    staleTime: 60 * 1000,
  })
}

export function useLedgerTypes() {
  const { token, localLedgerStore, isUsingLocalLedger } = useLedgerRuntime()

  return useQuery({
    queryKey: ['ledger-types', isUsingLocalLedger ? 'local' : 'remote'],
    queryFn: () => ledgerClient.listTransactionTypes({ token, ledgerStore: localLedgerStore }),
    enabled: Boolean(token || localLedgerStore),
    staleTime: 60 * 1000,
  })
}

export function useLedgerCategories() {
  const { token, localLedgerStore, isUsingLocalLedger } = useLedgerRuntime()

  return useQuery({
    queryKey: ['ledger-categories', isUsingLocalLedger ? 'local' : 'remote'],
    queryFn: () => ledgerClient.listCategories({ token, ledgerStore: localLedgerStore }),
    enabled: Boolean(token || localLedgerStore),
    staleTime: 60 * 1000,
  })
}

export function useAccountTransactions(accountId, { dateFrom, dateTo, limit = 200 } = {}) {
  const { token, localLedgerStore, isUsingLocalLedger } = useLedgerRuntime()

  return useQuery({
    queryKey: ['ledger-transactions', accountId, dateFrom ?? null, dateTo ?? null, limit, isUsingLocalLedger ? 'local' : 'remote'],
    queryFn: () => ledgerClient.listTransactions({
      accountId,
      token,
      ledgerStore: localLedgerStore,
      dateFrom,
      dateTo,
      pageSize: limit,
      order: 'desc',
    }),
    enabled: Boolean(accountId && (token || localLedgerStore)),
    staleTime: 60 * 1000,
    // Keep the table mounted while a new date range loads (no skeleton flash).
    placeholderData: keepPreviousData,
  })
}

export function useRunningBalance(accountId, upToDate) {
  const { localLedgerStore } = useLedgerRuntime()

  return useQuery({
    queryKey: ['ledger-running-balance', accountId, upToDate ?? null],
    queryFn: () => ledgerClient.getRunningBalance({ accountId, ledgerStore: localLedgerStore, upToDate }),
    enabled: Boolean(accountId && localLedgerStore),
    staleTime: 60 * 1000,
  })
}

export function useMonthlyCashFlow(accountId, year) {
  const { localLedgerStore } = useLedgerRuntime()

  return useQuery({
    queryKey: ['ledger-monthly-cash-flow', accountId, year ?? null],
    queryFn: () => ledgerClient.getMonthlyCashFlow({ accountId, ledgerStore: localLedgerStore, year }),
    enabled: Boolean(accountId && year && localLedgerStore),
    staleTime: 60 * 1000,
  })
}

export function useCategoryBreakdown(accountId, { dateFrom, dateTo } = {}) {
  const { localLedgerStore } = useLedgerRuntime()

  return useQuery({
    queryKey: ['ledger-category-breakdown', accountId, dateFrom ?? null, dateTo ?? null],
    queryFn: () => ledgerClient.getCategoryBreakdown({
      accountId,
      ledgerStore: localLedgerStore,
      dateFrom,
      dateTo,
    }),
    enabled: Boolean(accountId && localLedgerStore),
    staleTime: 60 * 1000,
  })
}

export function useAccountSummary(accountId, { dateFrom, dateTo } = {}) {
  const { token, localLedgerStore, isUsingLocalLedger } = useLedgerRuntime()

  return useQuery({
    queryKey: ['ledger-summary', accountId, dateFrom ?? null, dateTo ?? null, isUsingLocalLedger ? 'local' : 'remote'],
    queryFn: () => ledgerClient.getAccountSummary({
      accountId,
      token,
      ledgerStore: localLedgerStore,
      dateFrom,
      dateTo,
    }),
    enabled: Boolean(accountId && (token || localLedgerStore)),
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  })
}
