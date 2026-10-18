declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    STRIPE_MODE?: string;
    STRIPE_PAYMENT_LINK_URL?: string;
    STRIPE_PAYMENT_LINK_ID?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    SUPPORT_EMAIL?: string;
    PRICE_CENTS?: string;
    LIVE_SALES_ENABLED?: string;
    PRODUCT_SHA256?: string;
    ADMIN_TOKEN?: string;
    REPORT_TOKEN?: string;
  }
}
