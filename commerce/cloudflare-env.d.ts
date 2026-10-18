declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    STRIPE_MODE?: string;
    STRIPE_PAYMENT_LINK_URL?: string;
    STRIPE_PAYMENT_LINK_ID?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    SUPPORT_EMAIL?: string;
    SUPPORT_MODE?: string;
    EMAIL_ENABLED?: string;
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
    CUSTOMER_DATA_KEY?: string;
    JOB_TOKEN?: string;
    SITE_ORIGIN?: string;
    ANALYTICS_STARTED_AT?: string;
    PRICE_CENTS?: string;
    LIVE_SALES_ENABLED?: string;
    PRODUCT_SHA256?: string;
    ADMIN_TOKEN?: string;
    REPORT_TOKEN?: string;
  }
}
