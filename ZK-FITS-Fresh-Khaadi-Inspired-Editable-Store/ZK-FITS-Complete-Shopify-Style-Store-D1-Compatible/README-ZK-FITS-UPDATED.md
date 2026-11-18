# ZK FITS updated website files

This package updates the existing ZK FITS Cloudflare Pages website.

## Included changes
- Product page uses one vertical layout on desktop and mobile: gallery first, purchase options and quantity below, then description and details.
- Product images preserve their natural aspect ratio; mobile gallery supports finger swipe and hides previous/next arrows.
- Product admin allows multiple product images without the previous 10-image cap.
- Colour is optional. A size-only inventory row is supported; colour-specific images are optional.
- Hero kicker, heading, subtitle, and button text/link are controlled by Admin. Leave these fields empty to show a plain banner.
- Mobile menu panel is layered above the dimming overlay so its links can be tapped.
- Admin checks for new orders while the dashboard is open and shows a popup for newly received orders.
- When Admin changes an order to Confirmed, the customer receives a separate order-confirmation email through the existing Resend integration.
- Customer's initial email says the order was received and is awaiting confirmation.

## Important deployment safety
- This package intentionally does NOT include `schema.sql`, the `migrations/` folder, or `wrangler.toml`.
- Do not delete or replace your existing D1 database, database bindings, migrations, or secrets.
- Upload/replace the included website files in the existing repository. Keep your current `wrangler.toml`, `schema.sql`, and `migrations/` unchanged.

## Email configuration
Set these Cloudflare Pages environment variables/secrets for the existing project:
- `RESEND_API_KEY`: API key from Resend.
- `EMAIL_FROM`: sender using a domain verified in Resend, e.g. `ZK FITS <orders@your-verified-domain.com>`.
- `ADMIN_EMAIL`: address that receives new-order notifications.
- Keep existing `ADMIN_PASSWORD` and `SESSION_SECRET` values unchanged.

The backend reports whether an email was sent. A successful deployment alone does not prove email delivery; test with a real customer email and inspect the Resend delivery log.

## Verification checklist after deployment
1. Open `/admin` and verify products/orders still exist.
2. Edit Hero fields and save; blank all hero text/button fields to test plain banner.
3. Test mobile menu links on a phone.
4. Create a product with one size and no colour; test stock and checkout.
5. Create a product with colours; test size/colour stock and optional colour images.
6. Swipe product images on mobile and verify original image proportions.
7. Place a test order; verify Admin popup and admin email.
8. Change the test order status to Confirmed; verify customer confirmation email.

This package has been syntax-checked. Live Cloudflare/D1/Resend behaviour must still be tested after deployment.
