# Pull Request Template

## 📋 Description
Provide a clear and concise description of the changes proposed in this PR. Include any relevant issue numbers (e.g., `Closes #123`).

## 🛠️ Type of Change
- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [ ] ✨ New feature (non-breaking change which adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] ⚙️ Infrastructure / Dev-Ops update
- [ ] 📚 Documentation update

## ✅ Senior Checklist
- [ ] **Build Check**: Have you run `npm run build` locally? (Verify Windows/Linux compatibility).
- [ ] **Type Safety**: No `any` types used where a strict type is possible.
- [ ] **Linting**: PR passes `npm run lint`.
- [ ] **Logic**: If this affects payments or numbers, has the **Idempotency** been verified?
- [ ] **Docs**: Have you updated the relevant files in `/docs` if architecture changed?

## 🧪 Testing Results
- [ ] Unit tests added/updated and passed.
- [ ] Manual verification completed (please describe the steps taken).

## 📸 Screenshots / Media
(If applicable, add screenshots or recordings to show UI changes)

---
*By submitting this PR, I confirm that my contribution follows the project's [CONTRIBUTING.md](./CONTRIBUTING.md).*
