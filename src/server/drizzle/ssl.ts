/** Local Postgres (docker) has no SSL; hosted providers require it. */
export const sslFor = (connectionString: string) =>
    /localhost|127\.0\.0\.1/.test(connectionString)
        ? false
        : { rejectUnauthorized: false };
