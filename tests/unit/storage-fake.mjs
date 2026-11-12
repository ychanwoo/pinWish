import { createRequire } from 'node:module'
const { marshal, unmarshal } = createRequire(import.meta.url)(
  '../../backend/storage.cjs',
)
export function db() {
  const data = new Map()
  const key = (v) => v.pk + '|' + v.sk
  return {
    data,
    async send(command) {
      const p = command.input
      switch (command.constructor.name) {
        case 'GetItemCommand': {
          const v = data.get(key(unmarshal(p.Key)))
          return {
            Item: v
              ? marshal({
                  ...v,
                  ...(v.sources
                    ? {
                        sources: Object.fromEntries(
                          Object.entries(v.sources).map(([k, s]) => [
                            k,
                            Object.fromEntries(Object.entries(s).reverse()),
                          ]),
                        ),
                      }
                    : {}),
                })
              : undefined,
          }
        }
        case 'TransactWriteItemsCommand': {
          const reasons = p.TransactItems.map((operation) => {
            const input = operation.ConditionCheck ?? operation.Put
            const old = data.get(key(unmarshal(input.Key ?? input.Item)))
            const passed =
              input.ConditionExpression === 'attribute_not_exists(pk)'
                ? !old
                : old?.version ===
                  unmarshal(input.ExpressionAttributeValues)[':v']
            return { Code: passed ? 'None' : 'ConditionalCheckFailed' }
          })
          if (reasons.some((r) => r.Code !== 'None'))
            throw Object.assign(Error(), {
              name: 'TransactionCanceledException',
              CancellationReasons: reasons,
            })
          for (const operation of p.TransactItems)
            if (operation.Put) {
              const value = unmarshal(operation.Put.Item)
              data.set(key(value), value)
            }
          return {}
        }
        case 'UpdateItemCommand': {
          const k=key(unmarshal(p.Key)),old=data.get(k),v=unmarshal(p.ExpressionAttributeValues)
          if((old?.count??0)>=v[':limit']) throw Object.assign(Error(),{name:'ConditionalCheckFailedException'})
          data.set(k,{...unmarshal(p.Key),count:(old?.count??0)+v[':one'],expiresAt:v[':ttl']});return {}
        }
        case 'PutItemCommand': {
          const v = unmarshal(p.Item),
            old = data.get(key(v))
          if (
            !p.ConditionExpression ? false : p.ConditionExpression === 'attribute_not_exists(pk)'
              ? !!old
              : old?.version !== unmarshal(p.ExpressionAttributeValues)[':v']
          )
            throw Object.assign(Error(), {
              name: 'ConditionalCheckFailedException',
            })
          data.set(key(v), v)
          return {}
        }
        case 'DeleteItemCommand': {
          const k = key(unmarshal(p.Key)),
            old = data.get(k)
          if (old?.version !== unmarshal(p.ExpressionAttributeValues)[':v'])
            throw Object.assign(Error(), {
              name: 'ConditionalCheckFailedException',
            })
          data.delete(k)
          return {}
        }
        case 'QueryCommand': {
          const values = unmarshal(p.ExpressionAttributeValues)
          const all = [...data.values()]
            .filter(
              (x) =>
                x.pk === values[':pk'] && x.sk.startsWith(values[':prefix']),
            )
            .sort((a, b) => a.sk.localeCompare(b.sk))
          const start = p.ExclusiveStartKey
            ? all.findIndex((x) => x.sk === unmarshal(p.ExclusiveStartKey).sk) +
              1
            : 0
          const rows = all.slice(start, start + (p.Limit ?? 2))
          const last = rows.at(-1)
          return {
            Items: rows.map(marshal),
            ...(last && start + rows.length < all.length
              ? { LastEvaluatedKey: marshal({ pk: last.pk, sk: last.sk }) }
              : {}),
          }
        }
        default:
          throw Error('unexpected')
      }
    },
  }
}
