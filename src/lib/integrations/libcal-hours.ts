import { HoursProvider, HoursProviderResult, LIBCAL_HOURS_URL, OperationalHoursInterval } from "./hours";

type JsonRecord = Record<string, unknown>;

type LibCalOpeningHoursSpecification = {
  "@type"?: string;
  opens?: string;
  closes?: string;
  validFrom?: string;
  validThrough?: string;
  dayOfWeek?: string | string[];
  description?: string;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectRecords(value: unknown, predicate: (record: JsonRecord) => boolean, results: JsonRecord[] = []): JsonRecord[] {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectRecords(entry, predicate, results));
    return results;
  }

  if (!isRecord(value)) {
    return results;
  }

  if (predicate(value)) {
    results.push(value);
  }

  Object.values(value).forEach((entry) => collectRecords(entry, predicate, results));
  return results;
}

function extractJsonpPayload(text: string): unknown {
  const trimmed = text.trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }

  const firstParen = trimmed.indexOf("(");
  const lastParen = trimmed.lastIndexOf(")");

  if (firstParen === -1 || lastParen === -1 || lastParen <= firstParen) {
    throw new Error("LibCal response was not JSON or JSONP.");
  }

  return JSON.parse(trimmed.slice(firstParen + 1, lastParen));
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getLocationName(data: unknown): string {
  const namedRecord = collectRecords(data, (record) => typeof record.name === "string")[0];
  return asString(namedRecord?.name) ?? "LibCal location";
}

function normalizeSpecification(
  spec: LibCalOpeningHoursSpecification,
  locationName: string,
  retrievedAt: string,
): OperationalHoursInterval | null {
  const date = spec.validFrom?.slice(0, 10) ?? spec.validThrough?.slice(0, 10);

  if (!date) {
    return null;
  }

  const opensAt = spec.opens ?? null;
  const closesAt = spec.closes ?? null;
  const isClosed = !opensAt || !closesAt || opensAt === "00:00" && closesAt === "00:00";

  return {
    locationId: "libcal-2457",
    locationName,
    date,
    opensAt,
    closesAt,
    isClosed,
    note: spec.description,
    source: "libcal",
    sourceId: "2457",
    retrievedAt,
  };
}

export function normalizeLibCalJsonLd(data: unknown, retrievedAt = new Date().toISOString()): HoursProviderResult {
  const locationName = getLocationName(data);
  const specifications = collectRecords(
    data,
    (record) => record["@type"] === "OpeningHoursSpecification" || Boolean(record.opens || record.closes),
  ) as LibCalOpeningHoursSpecification[];

  const intervals = specifications
    .map((spec) => normalizeSpecification(spec, locationName, retrievedAt))
    .filter((interval): interval is OperationalHoursInterval => interval !== null);

  return {
    source: "libcal",
    retrievedAt,
    intervals,
    raw: data,
    warnings: intervals.length === 0 ? ["No dated opening-hours intervals were found in the LibCal JSON-LD payload."] : [],
  };
}

export class LibCalHoursProvider implements HoursProvider {
  readonly source = "libcal" as const;

  constructor(private readonly url = LIBCAL_HOURS_URL) {}

  async getHours(): Promise<HoursProviderResult> {
    const response = await fetch(this.url, { next: { revalidate: 900 } });

    if (!response.ok) {
      throw new Error(`LibCal hours request failed with HTTP ${response.status}.`);
    }

    const payload = extractJsonpPayload(await response.text());
    return normalizeLibCalJsonLd(payload);
  }
}
