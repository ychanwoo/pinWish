// Never return raw provider errors: they can include account and request identifiers.
export function importErrorCode(error) {
  const message = error?.message ?? ''
  const known = new Set(['carousel_unavailable', 'partial_carousel', 'unsupported_video_slide',
    'model_slide_coverage_incomplete', 'invalid_model_output', 'invalid_model_json',
    'model_output_incomplete', 'post_too_large', 'response_too_large',
    'unsupported_content_type', 'http_429', 'http_403', 'http_404', 'invalid_shortcode'])
  if (known.has(message)) return message
  if (error?.name === 'ResourceNotFoundException' && /use case details/i.test(message)) return 'aws_model_setup_required'
  if (error?.name === 'AccessDeniedException' || error?.name === 'CredentialsProviderError') return 'aws_access_denied'
  if (error?.name === 'ThrottlingException') return 'aws_throttled'
  if (['TimeoutError', 'AbortError'].includes(error?.name)) return 'analysis_timeout'
  if (error?.name === 'ValidationException') return 'aws_model_request_invalid'
  return 'lookup_failed'
}
