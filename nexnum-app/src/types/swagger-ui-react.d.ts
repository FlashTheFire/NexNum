declare module 'swagger-ui-react' {
    import React from 'react';

    interface SwaggerUIProps {
        url?: string;
        spec?: object;
        docExpansion?: 'list' | 'full' | 'none';
        defaultModelsExpandDepth?: number;
        defaultModelExpandDepth?: number;
        persistAuthorization?: boolean;
        onComplete?: () => void;
    }

    const SwaggerUI: React.FC<SwaggerUIProps>;
    export default SwaggerUI;
}
