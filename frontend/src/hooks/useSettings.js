import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../api'

export function useSettings() {
  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/config').then((r) => r.data),
  })
  return { currency: data?.display_currency ?? 'GBP', isLoading }
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.put('/config', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })
}

// Returns a formatter and currency symbol for the active currency
export function useCurrencyFormatter() {
  const { currency } = useSettings()
  function fmt(v, decimals = 0) {
    if (v == null) return '—'
    const locale = currency === 'USD' ? 'en-US' : 'en-GB'
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: decimals,
    }).format(v)
  }
  return { fmt, currency }
}
