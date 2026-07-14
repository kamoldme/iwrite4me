---
description: Alias command for /frontend design requests.
allowed-tools: Read, Write, Edit, MultiEdit, Bash, Glob, Grep, LS
---

# Frontend

If the first argument is `design`, use the same workflow as `/frontend-design`.

User arguments:

```
$ARGUMENTS
```

## Behavior

For `design` requests, create distinctive, production-grade frontend interfaces with high design quality. When pictures are attached, study their visual language and imitate the design direction while adapting it to this product.

Follow the project-local `/frontend-design` command guidance:

- Study attached images for layout, typography, color, spacing, visual hierarchy, icon treatment, motion, and memorable details.
- Adapt the design language to this product rather than copying the source exactly.
- Reuse the project's existing stack, tokens, components, and CSS patterns where practical.
- Keep the result responsive, accessible, and production-grade.
- Run and visually verify the changed screen when practical.

If the arguments do not begin with `design`, ask the user whether they meant `/frontend design` or `/frontend-design`.
