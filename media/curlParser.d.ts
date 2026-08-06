export declare function tokenizeCurl(cmd: string): string[];
export declare function parseCurl(curlString: string): {
    description: string;
    method: string;
    url: string;
    params: Array<{ key: string; value: string; enabled: boolean }>;
    headers: Array<{ key: string; value: string; enabled: boolean }>;
    bodyType: string;
    bodyText: string;
    bodyUrlEncoded: Array<{ key: string; value: string; enabled: boolean }>;
    bodyMultipart: Array<{ key: string; value: string | null; type: string; enabled: boolean }>;
    auth: any;
    importedCookies: Array<{ name: string; value: string; domain: string; path: string; createdAt: number }>;
};
