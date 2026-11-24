# ZK FITSS updated website files

This package updates the existing ZK FITSS Cloudflare Pages website.

## Included changes
- Product page uses one vertical layout on desktop and mobile: gallery first, purchase options and quantity below, then both Add to Cart and Buy Now buttons, followed by description and details.
- Both purchase buttons remain side-by-side on mobile, including narrow 320px screens.
- Product images preserve their natural aspect ratio; mobile gallery supports finger swipe and hides previous/next arrows.
- Product admin allows multiple product images without the previous 10-image cap.
- Colour is optional. A size-only inventory row is supported; colour-specific images are optional.
- Hero kicker, heading, subtitle, and button text/link are controlled by Admin. Leave these fields empty to show a plain banner.
- Mobile menu links are tappable on both homepage and product page; custom hash links entered in Admin resolve back to the matching homepage section when clicked from a product page.
- Default menu includes Home, Women, Girls, Collections, Featured and Contact links.
- Admin checks for new orders while the dashboard is open and shows a popup for newly received orders.
- When Admin changes an order to Confirmed, the customer receives a separate order-confirmation email through the existing Resend integration.
- Customer's initial email says the order was received and is awaiting confirmation.

## Important deployment safety
- This package includes `wrangler.toml`, `schema.sql`, and additive migrations for reference and deployment.
- Do not delete or replace your existing D1 database, database bindings, or secrets.
- Preserve the live database and apply only the required new migrations in order. Do not run the fresh `schema.sql` against an existing store database.

## Email configuration
Set these Cloudflare Pages environment variables/secrets for the existing project:
- `RESEND_API_KEY`: API key from Resend.
- `EMAIL_FROM`: sender using a domain verified in Resend, e.g. `ZK FITSS <orders@your-verified-domain.com>`.
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


## Analytics retention and storage monitor
- Added 90-day detailed-event retention with monthly rollups for long-term visitor and order reporting.
- Added Admin storage monitor for estimated analytics payload, event rows, archived monthly sessions and last cleanup time.
- Monthly archives preserve summary metrics and order-source attribution; order revenue reflects current order status.
- Apply migration `0006_analytics_retention.sql` to the existing D1 database after deploying: `npx wrangler d1 migrations apply zkfitss --remote`. Do not recreate the database.
- Cleanup is run at most once per 24 hours when an authenticated administrator opens Analytics. It is not a background cron job.
