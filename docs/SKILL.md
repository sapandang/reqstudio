# AI Skill: Generating REQ Studio `.req` Files

Use this skill when asked to create, edit, or generate a `.req` file for the **REQ Studio** VS Code extension.

---

## 1. What is a `.req` file?

A `.req` file is a **JSON document** that describes an HTTP/REST API request for the REQ Studio extension. It opens in a visual editor inside VS Code. The file must be valid JSON, saved with a `.req` extension.

---

## 2. JSON Schema

```json
{
  "description": "Human-readable label for the request",
  "method": "GET | POST | PUT | DELETE | PATCH | HEAD | OPTIONS",
  "url": "http://localhost:3000/api/users",
  "params": [
    { "key": "page", "value": "1", "enabled": true }
  ],
  "headers": [
    { "key": "Content-Type", "value": "application/json", "enabled": true },
    { "key": "Authorization", "value": "Bearer {{token}}", "enabled": true }
  ],
  "bodyType": "none | raw | text/plain | application/json | application/x-www-form-urlencoded | multipart/form-data | application/xml | application/octet-stream",
  "bodyText": "string payload for raw/text/json/xml",
  "bodyUrlEncoded": [
    { "key": "field", "value": "value", "enabled": true }
  ],
  "bodyMultipart": [
    { "key": "file", "value": null, "type": "file", "enabled": true },
    { "key": "name", "value": "John", "type": "text", "enabled": true }
  ],
  "auth": {
    "type": "none | bearer | basic | apiKey",
    "bearer": { "token": "{{token}}" },
    "basic": { "username": "admin", "password": "{{password}}" },
    "apiKey": { "key": "X-API-KEY", "value": "{{key}}", "addTo": "header | query" }
  },
  "rejectUnauthorized": true
}
```

---

## 3. Field Reference

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `description` | no | `string` | Human-readable label shown at the top of the UI. Keep it concise. |
| `method` | **yes** | `string` | HTTP method. Allowed: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`, `OPTIONS`. Default: `GET`. |
| `url` | **yes** | `string` | Full request URL. You may use `{{VAR}}` placeholders for environment variables. |
| `params` | no | `array` | Query parameters. Each item: `{ key, value, enabled: boolean }`. Only enabled params are appended to the URL at send time. |
| `headers` | no | `array` | Request headers. Each item: `{ key, value, enabled: boolean }`. |
| `bodyType` | no | `string` | Controls which body tab is active. Must be one of the allowed values. Use `none` for no body. |
| `bodyText` | no | `string` | Raw payload. Used when `bodyType` is `raw`, `text/plain`, `application/json`, or `application/xml`. |
| `bodyUrlEncoded` | no | `array` | Key-value pairs for `application/x-www-form-urlencoded`. Each item: `{ key, value, enabled: boolean }`. |
| `bodyMultipart` | no | `array` | Parts for `multipart/form-data`. Each item: `{ key, value, type: "text" \| "file", enabled: boolean }`. For `type: "file"`, `value` is always `null` on disk (the file is selected in the UI, not stored in JSON). At send time only, the UI replaces `value` with `{ name, size, base64content }` so the backend can rehydrate a `Buffer`. |
| `bodyBinaryFile` | no | `object\|null` | Runtime-only (octet-stream). **Never persisted to the `.req` file** — it is injected into the `send-request` message only. Shape at send time: `{ name, size, base64content }`. Omit from saved JSON. |
| `auth` | no | `object` | Authentication configuration. `{ type: "none" \| "bearer" \| "basic" \| "apiKey", bearer: { token }, basic: { username, password }, apiKey: { key, value, addTo: "header" \| "query" } }`. Auth headers/query are injected on every send, even with no `.reqenv` selected. |
| `rejectUnauthorized` | no | `boolean` | SSL certificate validation flag (`true` by default, `false` to allow self-signed certificates). |

---

## 4. Rules & Constraints

1. **Valid JSON** — The entire file must be parseable by `JSON.parse()`. No trailing commas.
2. **Default fallback** — If a field is omitted, the UI assumes defaults:
   - `method` → `GET`
   - `url` → `""`
   - `bodyType` → `none`
   - Arrays (`params`, `headers`, `bodyUrlEncoded`, `bodyMultipart`) → empty or single blank row in UI.
3. **Environment variables** — Use `{{VAR_NAME}}` syntax anywhere in `url`, `headers`, `bodyText`, `params`, `bodyUrlEncoded`, and `auth` values. Substitution runs at send time using a sidecar `.reqenv` file. **If no `.reqenv` is selected, `{{VAR}}` placeholders are left as-is** (no error) — structural logic (auth header injection, query-param append, Content-Type) still runs unconditionally.
4. **No file contents** — Do **not** embed base64 file data in `bodyMultipart` or persist `bodyBinaryFile`. Files are selected at runtime in the UI and exist only in the in-memory `send-request` payload, never on disk. Persist `value: null` for multipart file parts, and omit `bodyBinaryFile` from saved JSON.
5. **Method-body compatibility** — `GET` and `HEAD` requests typically do not send a body. REQ Studio still allows a body in the UI but strips it on the wire for `GET`. Prefer `bodyType: "none"` for `GET`.
6. **Content-Type auto-injection** — If the user does not provide a `Content-Type` header and `bodyType` is not `none` or `raw`, the extension auto-adds `Content-Type: <bodyType>`. You can still include it explicitly if needed.
7. **Auth works without an env file** — Bearer/Basic/apiKey headers are injected on every send regardless of whether a `.reqenv` is selected. Do not assume auth requires an env file.

---

## 5. Common Patterns

### Simple GET
```json
{
  "description": "Get all users",
  "method": "GET",
  "url": "https://api.example.com/users",
  "params": [
    { "key": "limit", "value": "10", "enabled": true }
  ]
}
```

### POST with JSON body
```json
{
  "description": "Create user",
  "method": "POST",
  "url": "https://api.example.com/users",
  "headers": [
    { "key": "Authorization", "value": "Bearer {{api_token}}", "enabled": true }
  ],
  "bodyType": "application/json",
  "bodyText": "{\\n  \\"name\\": \\"Alice\\",\\n  \\"role\\": \\"admin\\"\\n}"
}
```

### POST with form-urlencoded body
```json
{
  "description": "Login",
  "method": "POST",
  "url": "https://api.example.com/auth/login",
  "bodyType": "application/x-www-form-urlencoded",
  "bodyUrlEncoded": [
    { "key": "username", "value": "alice", "enabled": true },
    { "key": "password", "value": "{{password}}", "enabled": true }
  ]
}
```

### Multipart upload (file placeholder)
```json
{
  "description": "Upload avatar",
  "method": "POST",
  "url": "https://api.example.com/upload",
  "bodyType": "multipart/form-data",
  "bodyMultipart": [
    { "key": "avatar", "value": null, "type": "file", "enabled": true },
    { "key": "userId", "value": "42", "type": "text", "enabled": true }
  ]
}
```

### With disabled headers/parameters
```json
{
  "description": "Test with optional headers",
  "method": "GET",
  "url": "https://api.example.com/data",
  "headers": [
    { "key": "X-Debug", "value": "true", "enabled": false },
    { "key": "X-Api-Key", "value": "abc123", "enabled": true }
  ]
}
```

---

## 6. Environment Files (`.reqenv`)

If you generate `.req` files with `{{VAR}}` placeholders, mention that a `.reqenv` file can be placed in the **workspace root directory** or the **same directory** as the `.req` file (relative `.reqenv` files override root ones of the same environment name).

### Supported formats

**JSON:**
```json
{
  "baseUrl": "http://localhost:3000",
  "apiKey": "secret"
}
```

**Dotenv:**
```
baseUrl=http://localhost:3000
apiKey=secret
# This is a comment
```

Files named `.reqenv` are treated as the **default** environment and auto-selected. Other files must end in `.reqenv` (e.g., `staging.reqenv`).

---

## 7. Step-by-Step Generation Instructions

When a user asks you to create a `.req` file, follow this exact flow:

1. **Determine the HTTP method** from the user's description.
2. **Determine the URL** — use the full URL. If the user mentions a base URL that varies per environment, replace it with `{{baseUrl}}`.
3. **Determine query params** — extract anything that belongs in the query string into `params`.
4. **Determine headers** — map authentication tokens, content-type overrides, custom headers into `headers` with `enabled: true`.
5. **Determine body** — pick the correct `bodyType`:
   - JSON payload → `application/json` + `bodyText`
   - Plain text → `text/plain` + `bodyText` (or `raw`)
   - Form fields → `application/x-www-form-urlencoded` + `bodyUrlEncoded`
   - File upload + fields → `multipart/form-data` + `bodyMultipart`
   - Raw XML → `application/xml` + `bodyText`
   - No body → `none`
6. **Write a concise `description`** summarizing what the request does.
7. **Output valid JSON** with `.req` extension.
8. **If env vars are used**, offer to also generate the `.reqenv` file.

---

## 8. Example: Full Conversation Output

**User prompt:** "Create a request to create a new blog post. The API is at `https://blog-api.example.com/posts`. It needs an `Authorization: Bearer <token>` header and a JSON body with `title` and `content`. The token should come from an env var."

**Your output:**

File: `create-post.req`
```json
{
  "description": "Create a new blog post",
  "method": "POST",
  "url": "https://blog-api.example.com/posts",
  "headers": [
    { "key": "Authorization", "value": "Bearer {{blog_token}}", "enabled": true }
  ],
  "bodyType": "application/json",
  "bodyText": "{\\n  \\"title\\": \\"My First Post\\",\\n  \\"content\\": \\"Hello world!\\"\\n}"
}
```

File: `.reqenv` (place in same folder)
```
blog_token=YOUR_TOKEN_HERE
```

---

## 9. Quick Reference Checklist

- [ ] File extension is `.req`
- [ ] Content is valid JSON (no trailing commas)
- [ ] `method` is valid HTTP verb
- [ ] `url` is provided
- [ ] `bodyType` matches one of the allowed strings
- [ ] `bodyText` used only when bodyType is text-based
- [ ] `bodyMultipart` file parts have `value: null` and `type: "file"`
- [ ] `bodyBinaryFile` is **not** present in saved JSON (runtime-only)
- [ ] `enabled` is boolean on every param/header/field item
- [ ] `{{VAR}}` syntax documented with a `.reqenv` if used (placeholders are left as-is if no env file is selected)
