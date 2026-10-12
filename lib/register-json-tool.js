export function registerJsonTool(ctx, { name, description, parameters = {}, execute }) {
  ctx.tools.register({
    name,
    description,
    parameters,
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['result'],
        properties: {
          result: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.result }],
    },
    async execute(args, exec) {
      const out = await execute(args || {}, exec)
      return { result: typeof out === 'string' ? out : JSON.stringify(out, null, 2) }
    },
  })
}
