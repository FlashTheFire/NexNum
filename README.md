# NexNum - Virtual Number SMS Verification Platform

A premium SaaS platform for virtual phone number services and SMS verification, built with **Next.js 16**, **React 19**, and **Framer Motion**.

![NexNum Logo](https://img.shields.io/badge/NexNum-Virtual%20Numbers-C6FF00?style=for-the-badge&logo=phone&logoColor=black)

---

## � Technical Excellence

NexNum is engineered for performance and visual impact.

| Layer | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Framework** | Next.js | 16.1.1 | React framework with App Router & Turbopack |
| **UI Library** | React | 19 | Cutting-edge UI rendering |
| **Type Safety** | TypeScript | 5.x | Robust development experience |
| **Styling** | Tailwind CSS | 4.x | Utility-first styling with modern tokens |
| **Animations** | Framer Motion | 11.2.0 | Fluid, high-performance interactions |
| **Icons** | Lucide React | Latest | Premium vector iconography |

---

## � Project Architecture

```
nexnum-app/
├── src/
│   ├── app/
│   │   ├── globals.css        # Global styles & CSS variables
│   │   ├── layout.tsx         # Root layout
│   │   └── page.tsx           # Landing page entry
│   │
│   ├── components/
│   │   ├── home/              # Landing page sections
│   │   │   ├── Hero.tsx       # 3D Phone mockup & Headline
│   │   │   ├── Features.tsx   # Capabilities grid with connectors
│   │   │   ├── CTA.tsx        # Conversion section
│   │   │   ├── FAQ.tsx        # Interactive accordion
│   │   │   └── FloatingAppIcon.tsx  # Service orbit animations
│   │   │
│   │   ├── layout/            # Core shell components
│   │   │   ├── Navbar.tsx     # Glassmorphic navigation
│   │   │   └── Footer.tsx     # Site map & legal
│   │
│   └── lib/                   # Shared logic
│       └── utils.ts           # Design system utilities
```

---

## 🎨 Design System & Aesthetics

The platform utilizes a **Cosmic Dark** theme with cinema-grade visual effects.

### Color Matrix
| Variable | HSL Value | Hex Equivalent | Strategic Usage |
| :--- | :--- | :--- | :--- |
| `Charcoal` | `240 6% 6%` | `#101012` | Main canvas background |
| `Teal Deep`| `180 50% 12%` | `#0F2E2E` | Radial atmospheric glows |
| `Neon Lime`| `75 100% 50%` | `#C6FF00` | Branding & primary accents |

### Visual Signature
- **Atmospheric Gradients**: Charcoal to deep-teal radial transitions.
- **Micro-Texture**: Subtle SVG noise texture overlay for a "tactile" feel.
- **Cinematic Vignette**: Soft edge darkening to focus user attention.
- **Glassmorphism**: High-blur backdrop filters for premium depth.

---

## 🛠️ Operational Commands

```bash
# 1. Install dependencies
npm install

# 2. Launch Dev Environment (Turbopack)
npm run dev

# 3. Production Compilation
npm run build
```

---

## ♿ Accessibility & Standards
- **Reduced Motion**: Respects system-level `prefers-reduced-motion` settings.
- **Semantic HTML**: Full `aria-label` coverage for decorative icons.
- **Responsive Matrix**: Adaptive layouts for Mobile (<768px), Tablet (md), and Desktop (lg).

---

## 📄 License
MIT License - NexNum © 2024
