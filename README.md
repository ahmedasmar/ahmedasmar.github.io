# ahmedasmar.github.io

Source for [ahmedasmar.github.io](https://ahmedasmar.github.io) — Ahmad Asmar's portfolio site.

Built with [Astro](https://astro.build) + [Starlight](https://starlight.astro.build). Deployed to GitHub Pages on every push to `main` via the workflow in `.github/workflows/deploy.yml`.

## Develop locally

```sh
npm install
npm run dev      # serves at http://localhost:4321
```

## Build

```sh
npm run build    # outputs to ./dist
npm run preview  # serves the built ./dist locally
```

## Layout

```
src/
├── assets/                  # logo, images
├── content/docs/
│   ├── index.mdx            # home (hero)
│   ├── projects/            # featured projects
│   ├── architecture/        # design deep-dives
│   ├── stack.md             # tech stack reference
│   └── about.md             # bio + contact
└── styles/custom.css        # Starlight theme overrides
```

## Deploy

`main` → GitHub Actions → GitHub Pages. First-time setup requires `Settings → Pages → Source: GitHub Actions` to be enabled in the repository.

## License

Content © Ahmad Asmar. Site code MIT.
