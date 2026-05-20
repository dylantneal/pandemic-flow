<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Map assets

Regenerate Illinois county TopoJSON after updating `us-atlas`:

```bash
node apps/web/scripts/build-illinois-topojson.mjs
```

Output: `apps/web/public/data/illinois-counties.topo.json`
