---
description: Use attached images as visual references to create distinctive, production-grade frontend interfaces.
allowed-tools: Read, Write, Edit, MultiEdit, Bash, Glob, Grep, LS
---

# Frontend Design

Create distinctive, production-grade frontend interfaces with high design quality. Use this command when building or improving web components, pages, or applications, especially when the user provides reference screenshots or pictures.

## Reference Image Workflow

When pictures are attached:

1. Study the visual language before coding.
   - Layout structure, density, spacing, rhythm, and hierarchy
   - Typography personality, scale, weight, and casing
   - Color palette, contrast, shadows, borders, texture, and depth
   - Icon style, button treatment, hover states, motion, and transitions
   - What makes the design memorable

2. Imitate the design direction, not the source exactly.
   - Adapt the visual DNA to this product and its existing brand
   - Avoid copying protected logos, exact art, or distinctive brand assets unless they belong to this project
   - Keep the UI functional and coherent for the actual user workflow

3. Implement in the project's existing stack.
   - Reuse existing tokens, components, routes, and CSS patterns when they fit
   - Add new styling only where it strengthens the referenced direction
   - Keep layout responsive across mobile and desktop

4. Verify the result visually.
   - Run the app when practical
   - Check the changed screen at relevant viewport sizes
   - Fix obvious overlap, clipping, unreadable text, weak contrast, or broken interactions

## Design Thinking

Before coding, understand the context and commit to a bold aesthetic direction:

- Purpose: What problem does this interface solve? Who uses it?
- Tone: Pick a clear direction, such as brutally minimal, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, or industrial/utilitarian.
- Constraints: Technical requirements, performance, accessibility, and the current product language.
- Differentiation: What is the one thing someone will remember?

Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work. The key is intentionality.

## Frontend Aesthetics Guidelines

Focus on:

- Typography: Choose beautiful, characterful fonts when the project supports them. Avoid defaulting to generic Arial, Inter, Roboto, or system fonts unless the existing design system requires them.
- Color and theme: Commit to a cohesive palette. Use CSS variables for consistency. Strong dominant colors with sharp accents are usually better than timid, evenly distributed palettes.
- Motion: Use animations for meaningful effects and micro-interactions. Prefer CSS-only motion for simple HTML. Prioritize a few high-impact moments over scattered decoration.
- Spatial composition: Use asymmetry, overlap, diagonal flow, generous negative space, or controlled density when it serves the design.
- Backgrounds and details: Create atmosphere with contextual textures, layered transparencies, shadows, borders, grain, geometric patterns, or other details that match the chosen aesthetic.

Avoid generic AI aesthetics: purple gradients on white, predictable card grids, bland spacing, default font stacks, and designs that could belong to any product.

## Implementation Standard

The result must be:

- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear point of view
- Accessible enough to use comfortably
- Responsive without overlapping or clipped text
- Integrated with the current codebase rather than pasted in as an unrelated mockup

If the user asks to imitate attached pictures but no images are available in the conversation or workspace, ask for the images or a path to them before making visual changes.
