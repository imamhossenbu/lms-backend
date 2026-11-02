import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { randomBytes } from "crypto";
import { promises as dns } from "dns";
import { SAAS_CNAME_TARGET, SAAS_ROOT_DOMAIN } from "../saas.constants";
import type { InstitutionView, SaasActorKind } from "../saas.types";
import { SaasCoreService } from "./saas-core.service";

/**
 * Custom domains (Pro+ feature). Verification does a real DNS lookup:
 *   CNAME  <domain>                → cname.edupro.com
 *   TXT    _edupro-verify.<domain> → the institution's txtToken
 * Set SAAS_MOCK_DNS=true for local demos: succeeds unless the domain contains "fail" (same as the mock store).
 */
@Injectable()
export class SaasDomainsService {
  constructor(private readonly core: SaasCoreService) {}

  async add(institutionId: string, domain: string, actor: SaasActorKind): Promise<InstitutionView> {
    if (domain === SAAS_ROOT_DOMAIN || domain.endsWith(`.${SAAS_ROOT_DOMAIN}`))
      throw new BadRequestException(`Use your own domain — ${SAAS_ROOT_DOMAIN} addresses are assigned automatically.`);
    return this.core.tx(async (tx) => {
      const inst = await this.core.mustInstitution(tx, institutionId);
      const plan = await this.core.mustPlan(tx, inst.subscription.planId);
      if (!plan.features.includes("customDomain")) throw new BadRequestException(`Custom domains need the Pro plan or higher (currently ${plan.name}).`);
      if (inst.customDomain) throw new BadRequestException("Remove the current custom domain before adding another.");
      if (await tx.customDomain.findUnique({ where: { domain } })) throw new ConflictException(`${domain} is already connected to another institution.`);
      await tx.customDomain.create({
        data: { institutionId, domain, status: "PENDING_DNS", dnsTarget: SAAS_CNAME_TARGET, txtToken: `edupro-verify=${randomBytes(9).toString("hex")}` },
      });
      await this.core.event(tx, institutionId, "DOMAIN_ADDED", `Custom domain ${domain} added — waiting for DNS`, actor);
      return this.core.mustInstitution(tx, institutionId);
    });
  }

  private async dnsLooksRight(domain: string, token: string): Promise<boolean> {
    if (process.env.SAAS_MOCK_DNS === "true") return !domain.includes("fail");
    const [cnames, txts] = await Promise.all([
      dns.resolveCname(domain).catch(() => [] as string[]),
      dns.resolveTxt(`_edupro-verify.${domain}`).catch(() => [] as string[][]),
    ]);
    const cnameOk = cnames.some((c) => c.replace(/\.$/, "").toLowerCase() === SAAS_CNAME_TARGET);
    const txtOk = txts.some((chunks) => chunks.join("") === token);
    return cnameOk && txtOk;
  }

  /** Checks DNS; on failure stores FAILED, logs it and throws a friendly error. */
  async verify(institutionId: string): Promise<InstitutionView> {
    const inst = await this.core.mustInstitution(this.core.prisma, institutionId);
    const d = inst.customDomain;
    if (!d) throw new BadRequestException("No custom domain to verify.");
    const ok = await this.dnsLooksRight(d.domain, d.txtToken);
    const checked = new Date();
    const result = await this.core.tx(async (tx) => {
      await tx.customDomain.update({
        where: { institutionId },
        data: { status: ok ? "VERIFIED" : "FAILED", verifiedAt: ok ? checked : null, lastCheckedAt: checked },
      });
      if (ok) await this.core.event(tx, institutionId, "DOMAIN_VERIFIED", `${d.domain} verified — SSL certificate issued`, "System");
      else await this.core.event(tx, institutionId, "NOTE", `Verification of ${d.domain} failed — CNAME / TXT records not found`, "System");
      return this.core.mustInstitution(tx, institutionId);
    });
    if (!ok)
      throw new BadRequestException(
        `We couldn't find the DNS records for ${d.domain}. Check the CNAME and TXT records — DNS changes can take up to 24 hours.`,
      );
    return result;
  }

  async remove(institutionId: string, actor: SaasActorKind): Promise<InstitutionView> {
    return this.core.tx(async (tx) => {
      const inst = await this.core.mustInstitution(tx, institutionId);
      if (!inst.customDomain) throw new BadRequestException("No custom domain to remove.");
      await tx.customDomain.delete({ where: { institutionId } });
      await this.core.event(tx, institutionId, "NOTE", `Custom domain ${inst.customDomain.domain} removed — back to ${inst.slug}.${SAAS_ROOT_DOMAIN}`, actor);
      return this.core.mustInstitution(tx, institutionId);
    });
  }
}
