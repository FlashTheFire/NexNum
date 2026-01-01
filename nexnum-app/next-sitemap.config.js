module.exports = {
    siteUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://nexnum.com',
    generateRobotsTxt: true,
    exclude: ['/admin/*', '/dashboard/*', '/api/*'],
    robotsTxtOptions: {
        policies: [
            {
                userAgent: '*',
                allow: '/',
                disallow: ['/admin', '/dashboard', '/api'],
            },
        ],
    },
}
