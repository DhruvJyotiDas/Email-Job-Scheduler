import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (endpoint) {
  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({
      url: `${endpoint}/v1/traces`,
      headers: process.env.SIGNOZ_ACCESS_TOKEN
        ? { 'signoz-access-token': process.env.SIGNOZ_ACCESS_TOKEN }
        : {},
    }),
    instrumentations: [getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
    })],
  });

  sdk.start();
  process.on('SIGTERM', () => void sdk.shutdown());
  process.on('SIGINT', () => void sdk.shutdown());
}
