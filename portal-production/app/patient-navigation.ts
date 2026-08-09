import { findPatientTool } from "../content/patient-tools-catalog.ts";
import { findEducationArticle } from "./education-content.ts";

export type PatientArea = "home" | "records" | "map" | "resources";

export type PatientResourceView = "index" | "tools" | "readings";

export type PatientRoute = {
  area: PatientArea;
  resourceView: PatientResourceView;
  toolId: string | null;
  educationSlug: string | null;
};

export const DEFAULT_PATIENT_ROUTE: PatientRoute = {
  area: "home",
  resourceView: "index",
  toolId: null,
  educationSlug: null,
};

function decodePathSegment(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function patientRouteFromHash(hash: string): PatientRoute {
  const path = hash
    .replace(/^#/u, "")
    .replace(/^\/+|\/+$/gu, "");
  const [area, resource, item] = path.split("/");

  if (area === "registros") {
    return { area: "records", resourceView: "index", toolId: null, educationSlug: null };
  }
  if (area === "meu-mapa") {
    return { area: "map", resourceView: "index", toolId: null, educationSlug: null };
  }
  if (area !== "recursos") return DEFAULT_PATIENT_ROUTE;

  if (resource === "ferramentas") {
    const decodedToolId = decodePathSegment(item);
    return {
      area: "resources",
      resourceView: "tools",
      toolId: findPatientTool(decodedToolId)?.id ?? null,
      educationSlug: null,
    };
  }
  if (resource === "leituras") {
    const decodedEducationSlug = decodePathSegment(item);
    return {
      area: "resources",
      resourceView: "readings",
      toolId: null,
      educationSlug: findEducationArticle(decodedEducationSlug)?.slug ?? null,
    };
  }
  return {
    area: "resources",
    resourceView: "index",
    toolId: null,
    educationSlug: null,
  };
}

export function patientHashForRoute(route: PatientRoute): string {
  if (route.area === "records") return "#registros";
  if (route.area === "map") return "#meu-mapa";
  if (route.area !== "resources") return "#inicio";
  if (route.resourceView === "tools") {
    return route.toolId
      ? `#recursos/ferramentas/${encodeURIComponent(route.toolId)}`
      : "#recursos/ferramentas";
  }
  if (route.resourceView === "readings") {
    return route.educationSlug
      ? `#recursos/leituras/${encodeURIComponent(route.educationSlug)}`
      : "#recursos/leituras";
  }
  return "#recursos";
}

export function patientRoutesMatch(left: PatientRoute, right: PatientRoute): boolean {
  return (
    left.area === right.area &&
    left.resourceView === right.resourceView &&
    left.toolId === right.toolId &&
    left.educationSlug === right.educationSlug
  );
}
