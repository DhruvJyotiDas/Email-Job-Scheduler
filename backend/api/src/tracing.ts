// Loaded via --require before index.js so OTel patches Express/Redis/Prisma at module load time.
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (endpoint) {
  const sdk = new NodeSDK({
    // OTEL_SERVICE_NAME env var is read automatically by the SDK.
    traceExporter: new OTLPTraceExporter({
      url: `${endpoint}/v1/traces`,
      headers: process.env.SIGNOZ_ACCESS_TOKEN
        ? { 'signoz-access-token': process.env.SIGNOZ_ACCESS_TOKEN }
        : {},
    }),
    instrumentations: [getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false }, // too noisy
    })],
  });

  sdk.start();
  process.on('SIGTERM', () => void sdk.shutdown());
  process.on('SIGINT', () => void sdk.shutdown());
}
