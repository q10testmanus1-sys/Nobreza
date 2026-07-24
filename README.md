# Nobreza

App de controle financeiro pessoal — entradas, dívidas fixas, parcelamentos e
gráfico de gastos por categoria. Já vem pronto pra virar um PWA (instalável
no celular).

## 1. Rodar localmente (opcional, pra testar antes)

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173`.

## 2. Subir no GitHub

```bash
git init
git add .
git commit -m "primeira versão do Nobreza"
```

Depois crie um repositório vazio no GitHub e siga as instruções que ele
mesmo mostra pra "subir um projeto existente".

## 3. Publicar no Netlify

1. Entre no Netlify e escolha **"Add new site" → "Import an existing project"**
2. Selecione o repositório do GitHub
3. Configure:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
4. Clique em publicar. O Netlify te dá um link (tipo `nobreza.netlify.app`)

## 4. Virar PWA (instalar como app no celular)

Isso já está configurado no projeto (`manifest.json`, ícones e
`sw.js`/service worker na pasta `public/`). Depois de publicado no Netlify:

- **Android (Chrome):** abra o link do site → menu (⋮) → "Instalar app" ou
  "Adicionar à tela inicial"
- **iPhone (Safari):** abra o link → toque em Compartilhar → "Adicionar à
  Tela de Início"

O ícone que aparece é o mesmo logotipo dourado do Nobreza.

## Dados salvos

Os dados ficam salvos no `localStorage` do navegador (arquivo
`src/lib/storage.js`). Cada aparelho guarda os dados separadamente — não há
sincronização entre dispositivos nesta versão.
