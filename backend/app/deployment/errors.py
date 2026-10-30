"""Allowlisted, bounded deployment diagnostics without request bodies or credentials."""
from collections.abc import Mapping
from contextlib import contextmanager
import re
from urllib.parse import urlsplit, urlunsplit


@contextmanager
def operation(name):
    print(f'Deployment operation: {name}', flush=True)
    try:
        yield
    except Exception as exc:
        if not getattr(exc, 'deployment_operation', None):
            exc.deployment_operation = name
        raise


def safe_text(value):
    text = str(value)
    text = re.sub(r'Bearer\s+[^\s,;]+', 'Bearer [redacted]', text, flags=re.I)
    text = re.sub(r'\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b', '[token redacted]', text)
    text = re.sub(r'(?i)\b(access_token|client_secret|api[_-]?key|accountkey|subscriptionkey|authorization|sig|password|token)["\']?\s*[:=]\s*["\']?[^\s,;"\']+',
        r'\1=[redacted]', text)
    def hide_query(match):
        try:
            parsed = urlsplit(match.group())
            return urlunsplit((parsed.scheme, parsed.netloc.split('@')[-1], parsed.path,
                '[redacted]' if parsed.query else '', ''))
        except ValueError:
            return '[URL omitted]'
    text = re.sub(r'https?://[^\s<>"\']+', hide_query, text)
    text = ' '.join(text.split())
    text = text.replace('##vso[', '[pipeline command redacted]').replace('##[', '[pipeline marker redacted]')
    return text[:1500]


def field(value, key):
    return value.get(key) if isinstance(value, Mapping) else getattr(value, key, None)


def error_details(exc):
    result = {'operation': safe_text(getattr(exc, 'deployment_operation', 'configuration/client initialization')),
        'exceptionType': type(exc).__name__}
    status = getattr(exc, 'status_code', None)
    if isinstance(status, int):
        result['httpStatus'] = status
    error = getattr(exc, 'error', None)
    if error is None:
        body = getattr(exc, 'body', None)
        if isinstance(body, Mapping):
            error = body.get('error', body)
    # Azure SDK's parsed error carries its code/message, without request headers/body.
    for key in ('code', 'message', 'target'):
        value = field(error, key)
        if value:
            result[key] = safe_text(value)
    if 'message' not in result:
        result['message'] = safe_text(str(exc))
    details = field(error, 'details')
    if isinstance(details, list):
        result['details'] = [{key: safe_text(field(item, key)) for key in ('code', 'message', 'target')
            if field(item, key)} for item in details[:3]]
    response = getattr(exc, 'response', None)
    headers = getattr(response, 'headers', None)
    if headers:
        for name in ('x-ms-request-id', 'apim-request-id', 'request-id', 'x-request-id'):
            value = headers.get(name)
            if value:
                result['requestId'] = safe_text(value)
                break
    return result
