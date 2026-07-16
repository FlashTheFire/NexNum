---
name: NexNum
colors:
  surface: '#08080a'
  surface-container: '#111114'
  surface-container-high: '#17171b'
  on-surface: '#ffffff'
  on-surface-variant: '#9ca3af'
  outline: '#ffffff14'
  primary: '#c6ff00'
  on-primary: '#08080a'
  primary-container: '#c6ff0026'
  secondary: '#146666'
  error: '#fca5a5'
  background: '#08080a'
  on-background: '#ffffff'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 1.1
    letterSpacing: -0.03em
  headline-md:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 1.15
    letterSpacing: -0.025em
  body-base:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 1.5
    letterSpacing: '0'
rounded:
  DEFAULT: 0.5rem
  lg: 1rem
  xl: 1.5rem
  auth-card: 1.5rem
spacing:
  unit: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
---

# Design System: NexNum

## 1. Visual Theme & Atmosphere

NexNum is a dark, high-assurance virtual-number platform. Its atmosphere is a premium technical control room: near-black depth, transparent glass surfaces, a restrained teal signal layer, and a vivid neon-lime activation color. Motion and light communicate live infrastructure rather than decoration.

The interface should feel fast but calm. Large display copy is compact and direct, while surfaces have generous breathing room and quiet borders. Lime is an intentional conversion and confirmed-state signal, never a general-purpose text color.

## 2. Color Palette & Roles

### Primary Foundation

- **Obsidian Relay — `#08080a`**: application background and deepest visual field.
- **Graphite Glass — `#111114` / translucent white overlays**: elevated cards, header treatments, and form surfaces.
- **Deep Signal Teal — `hsl(180 70% 17%)`**: cool ambient depth within gradients.

### Accent & Interactive

- **Nex Lime — `#c6ff00`**: primary buttons, confirmed identity, focus moments, and small status details.
- **Soft Nex Lime — `hsl(72 80% 60%)`**: hover value for primary actions.
- **Signal Teal — `hsl(175 50% 25%)`**: secondary glow and background energy.

### Typography & Text Hierarchy

- **White — `#ffffff`**: titles, active controls, and important identifiers.
- **Cloud Gray — `#9ca3af`**: body copy and supporting instruction.
- **Dim Gray — `#6b7280`**: labels, metadata, and passive hints.

### Functional States

- **Confirmed — Nex Lime**: successful verification or a ready state.
- **Attention — amber (`#fcd34d`)**: expired or action-needed flow.
- **Error — soft red (`#fca5a5`)**: failed or unsafe state.

## 3. Typography Rules

Inter is the product typeface. Display headlines use 700 weight, negative tracking, and tight line-height to feel engineered and decisive. Interface text stays at 14–16px with relaxed 1.5 line-height for accessibility.

Eyebrows are 11–12px, bold, uppercase, and use generous 0.18–0.22em tracking. They use Nex Lime to establish a clear state before the headline. Email addresses and numeric codes use a stable, high-contrast treatment with a generous line break policy.

## 4. Component Stylings

### Buttons

Primary actions are 52–56px tall, filled Nex Lime, with black bold labels and a soft lime halo. Secondary buttons are translucent graphite with a white 8% border. Every button has a distinct disabled state and should retain a 44px minimum touch target.

### Cards & Auth Surfaces

Auth cards use 24px rounded corners, a 1px white 8% border, a 20px backdrop blur, subtle inset highlights, and a low black shadow. A narrow lime rim light at the bottom gives the surface a live-system character without adding visual noise.

### Navigation

The navigation is fixed and transparent at rest, becoming a blurred obsidian surface on scroll. Brand lockup combines a lime logo tile, white `Nex`, lime `Num`, and a tiny uppercase product descriptor.

### Inputs & Forms

Inputs are 48–56px dark translucent fields with white 10% borders. Icons shift from gray to lime at focus. Focus rings are low-opacity lime rather than saturated outlines.

### Verification States

Verification uses a square rounded icon well rather than generic circular illustrations. The icon well combines a lime/teal gradient, soft bloom, and state-specific line icon. The email identity is presented as a protected dark inset field.

## 5. Layout Principles

### Grid & Structure

Desktop authentication uses a split composition: a large product-device scene on the left and a 420–520px action panel on the right. Mobile collapses into a single column with a compact brand lockup and one centered card.

### Whitespace Strategy

Use a 4px baseline. Major panels use 32–40px padding, state groups use 24px separation, and dense controls use 12px gaps. The intent is calm, deliberate operation rather than a cramped settings screen.

### Alignment & Visual Balance

Desktop form headings are left aligned, with status content centered inside the card. Mobile keeps the surrounding hierarchy left aligned but centers the identity mark and card actions. Decorative device content disappears below the `lg` breakpoint.

### Responsive Behavior & Touch

At less than 1024px, reduce background animation and hide the large 3D device. Preserve clear focus styles, large buttons, email wrapping, and a stable, non-jumping card height. Respect `prefers-reduced-motion` for all atmospheric effects.

## 6. Design System Notes for Stitch Generation

### Language to Use

Describe the look as: “premium dark virtual-number platform,” “obsidian glass,” “neon-lime controlled activation,” “subtle teal infrastructure glow,” and “high-assurance technical calm.”

### Color References

Anchor screens in Obsidian Relay `#08080a`; reserve Nex Lime `#c6ff00` for activation, confirmation, and the main call to action. Use transparent white borders below 10% opacity.

### Component Prompts

- “Create a secure email-verification card on an obsidian glass surface with a neon-lime email icon well, protected email field, resend action, and compact three-step instruction row.”
- “Create a split authentication page for a virtual-number platform: atmospheric dark tech background and product-device preview on the left, compact confirmation workflow on the right.”

### Incremental Iteration

Keep the shared `AuthBackground`, `AuthCard`, and `Navbar` primitives intact. New screens should reuse these visual anchors before introducing any new decorative treatment.
