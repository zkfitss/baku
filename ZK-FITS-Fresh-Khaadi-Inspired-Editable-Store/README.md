# ZK FITS — fresh Khaadi-inspired storefront

This is a fresh ZK FITS implementation, not the earlier starter ZIP. It includes a customer storefront, mobile navigation, product catalogue, cart/checkout, and an admin dashboard.

## Cloudflare setup
1. Upload the contents of this folder to your GitHub repository.
2. In Cloudflare Pages, connect the repository. Set build command to blank and output directory to `.`.
3. In the Pages project, add D1 database binding:
   - Variable name: `DB`
   - Database: `zkfitss`
   - Database ID: `3a792c3a-4bb9-42b6-957c-c252803b2611`
4. Run `schema.sql` against the existing `zkfitss` D1 database (only if these tables do not already exist; statements use IF NOT EXISTS).
5. Add Pages environment variables `ADMIN_PASSWORD` and `SESSION_SECRET`. Use a strong unique password and a random secret. Never share them in chat.
6. Deploy, then open `/admin.html`.

## Included features
- Editable product catalogue, categories, prices, sale prices, stock, sizes, colours, featured/active flags
- Store settings for logo URL, hero image URL, text, announcement, footer, social links and shipping settings
- Orders and order status management
- Cart and COD / bank transfer / Easypaisa-JazzCash checkout selection
- Responsive desktop/mobile storefront and mobile menu

## Important limits / production tasks
- Image uploads in this starter store the selected image as a data URL in D1. For a large catalogue, configure Cloudflare R2 and replace this with R2 uploads.
- Bank transfer and wallet selections are manual instructions, not automatic payment gateway verification.
- This package is a working foundation; test checkout, admin login and D1 binding on a staging deployment before sending customers to it. It does not claim Shopify parity for every feature (e.g. discount engine, customer accounts, refunds, automated courier integrations).
- The admin cookie is a simple signed-token pattern suitable for a controlled initial deployment, but have it security-reviewed before handling substantial customer data.
