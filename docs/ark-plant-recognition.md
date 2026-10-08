# Doubao Plant Recognition Setup

## Cloud function environment variables

After uploading and deploying `cloudfunctions/quickstartFunctions`, add these variables in the cloud development console:

- `ARK_API_KEY`: Volcengine Ark API key
- `ARK_ENDPOINT_ID`: Endpoint ID of a vision-capable model created in Ark
- `ARK_API_URL`: optional; defaults to `https://ark.cn-beijing.volces.com/api/v3/chat/completions`

Keep the API key in cloud function environment variables only. Do not put it under `miniprogram` or commit it to source control.

## Usage

1. Open the tree record form.
2. Add a field photo.
3. Tap the recognition button on the photo.
4. Review the Chinese name, Latin name, confidence, candidates, and reason.
5. Tap the adopt button, then save the record.

Recognition is advisory. It does not silently overwrite a confirmed record and it does not bypass the existing image audit or form validation.

## Model requirement

`ARK_ENDPOINT_ID` must point to a vision-capable Endpoint. The code intentionally does not hard-code a model name because available model deployments vary by account.

## Troubleshooting

- Missing configuration: check both variable names and redeploy the cloud function.
- Timeout: check cloud function outbound network access, Endpoint status, and API key permissions or quota.
- Image too large: use a smaller photo; the current function rejects images above 6 MB.
- Uncertain result: enter the species manually or compare the candidates with leaves, bark, flowers, and fruit in the field.
