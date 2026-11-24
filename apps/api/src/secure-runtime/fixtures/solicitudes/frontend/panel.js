// Isolated frontend component of the reference fixture. Runs in a sandboxed,
// opaque-origin frame; its only API is window.runly.call (host bridge).
window.addEventListener('runly:ready', async () => {
  const root = document.getElementById('root')
  try {
    const records = await window.runly.call('records.list', { entity: 'solicitud', limit: 50 })
    const counts = {}
    for (const record of records) counts[record.data.estado] = (counts[record.data.estado] || 0) + 1
    root.textContent = ''
    const title = document.createElement('h2')
    title.textContent = 'Solicitudes: ' + records.length
    root.appendChild(title)
    const list = document.createElement('ul')
    for (const [estado, total] of Object.entries(counts)) {
      const item = document.createElement('li')
      item.textContent = estado + ': ' + total
      item.dataset.estado = estado
      list.appendChild(item)
    }
    root.appendChild(list)
    root.dataset.state = 'ready'
  } catch (error) {
    root.textContent = 'No se pudieron cargar las solicitudes.'
    root.dataset.state = 'error:' + (error.code || 'unknown')
  }
})
