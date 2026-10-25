// Document kind "lms.certificate" (certificado de curso): the tag contract of
// the LMS certificate templates (lms-cert-docx.js) as a kind schema, the label
// vocabulary used to auto-tag company forms (lms-cert-docx-suggest.js) and the
// image sizing of Word/PowerPoint. LMS fills it through hub.engine; the
// built-in pdfkit "design" source never goes through the hub.
import {
  CERT_DOCX_IMAGE_TAGS, CERT_DOCX_SCALAR_TAGS, buildCertDocxData, imageSizer,
} from "../../lms/lms-cert-docx.js";
import { CERT_LABELS, IMPORTANT, SIGNATURE, suggestCertificateTags } from "../../lms/lms-cert-docx-suggest.js";
import { pptxImageSizer } from "../../lms/lms-cert-pptx.js";
import { FIELD_LABELS } from "../../lms/lms-cert-pdf-layout.js";
import { DocumentProviderError } from "../document-provider-registry.js";

export const LMS_CERTIFICATE_KIND = "lms.certificate";

const IMAGE_LABELS = { qr: "Código QR de verificación", firma: "Firma", logo: "Logotipo de la empresa" };

export const LMS_CERTIFICATE_SCHEMA = [
  ...CERT_DOCX_SCALAR_TAGS.map((tag) => ({ tag, label: FIELD_LABELS[tag] ?? tag, type: tag === "fecha" ? "date" : "text" })),
  ...CERT_DOCX_IMAGE_TAGS.map((tag) => ({ tag, label: IMAGE_LABELS[tag] ?? tag, type: "image" })),
];

const SAMPLE_CERTIFICATE = {
  folio: "2026-000001",
  learnerName: "Nombre del alumno",
  courseTitle: "Nombre del curso",
  hours: 2,
  issuedAt: new Date(Date.UTC(2026, 0, 15, 12)),
};

export function createLmsCertificateDocumentKind({ prisma }) {
  return {
    key: LMS_CERTIFICATE_KIND,
    label: "Certificado de curso",
    permissionKey: "lms.enrollment.manage",
    managePermissionKey: "lms.course.manage",
    formats: ["docx", "pptx", "pdf"],
    schema: LMS_CERTIFICATE_SCHEMA,
    labels: CERT_LABELS,
    signatures: [{ pattern: SIGNATURE, tag: "firma" }],
    important: IMPORTANT.filter((tag) => !tag.startsWith("%")),
    sampleData: buildCertDocxData({ certificate: SAMPLE_CERTIFICATE, companyName: "Empresa de ejemplo", instructor: "Nombre del instructor", calificacion: "95" }),
    // Word suggestions use the full certificate vocabulary (paragraph placeholders, blanks).
    suggestDocx: suggestCertificateTags,
    imageSize: { docx: imageSizer, pptx: pptxImageSizer },
    // Data only; the instructor, grade and images are supplied by the caller that owns them.
    async load({ companyId, sourceId }) {
      const certificate = await prisma.lmsCertificate.findFirst({ where: { id: sourceId, companyId } });
      if (!certificate) throw new DocumentProviderError("Certificado no encontrado.", 404, "source_not_found");
      const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
      return buildCertDocxData({ certificate, companyName: company?.name ?? "" });
    },
  };
}
