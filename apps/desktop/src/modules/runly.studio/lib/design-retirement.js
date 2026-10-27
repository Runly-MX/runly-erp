export function retireDesignCaches(client, scopeKey, id) {
  client.setQueriesData({queryKey:['studio',...scopeKey,'designs']},rows=>Array.isArray(rows)?rows.filter(row=>row.id!==id):rows)
  client.removeQueries({queryKey:['studio','preview-images',id]})
  client.removeQueries({queryKey:['studio',...scopeKey,'design',id]})
}
