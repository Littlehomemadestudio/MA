#!/usr/bin/env python3
"""MATH ARENA - Question bank builder v2 (intelligent engine).

Builds on the legacy generators (ch1-7) and the new intelligent families
(generators3): conceptual / reverse / error-id / multi-step / application /
comparison / challenge.

v2 additions:
  * every question carries: family, tier (reasoning depth 1-4),
    template id, structural fingerprint, bookPage, optionFeedback
  * near-duplicate rejection via fingerprints (digit-stripped structure)
  * per-(skill, template) cap to force structural variety
  * independent validation via validators.py (legacy) and
    validators3.py (new families)
"""
import json
import os
import random
import sys

HERE = os.path.dirname(__file__)
sys.path.insert(0, HERE)

import generators          # noqa: F401 (registers ch1-4)
import generators2         # noqa: F401 (registers ch5-7)
import generators3         # noqa: F401 (registers v2 families)
from generators import GENERATOR_LIST
import validators
import validators3

EST_SECONDS_LEGACY = {1: 20, 2: 30, 3: 45}
EST_SECONDS_V2 = {1: 22, 2: 38, 3: 60, 4: 85}
MASTERY_WEIGHT = {1: 0.8, 2: 1.0, 3: 1.3, 4: 1.6}
TEMPLATE_CAP = 8           # max questions sharing one (skill, template)
FP_DUP_LIMIT = 3           # max questions sharing one (skill, fingerprint)

LEGACY_FAMILY = {
    "conceptual": "conceptual",
    "word-problem": "application",
    "error-id": "error-id",
    "numeric": "direct", "algebraic": "direct", "symbolic": "direct",
    "equation": "direct", "geometry": "direct", "membership": "direct",
    "inequality": "direct", "counting": "direct",
}
FAMILY_LABELS = {
    "conceptual": "مفهومی", "reverse": "وارونه", "error-id": "خطایاب",
    "multi-step": "چندمرحله‌ای", "application": "کاربردی", "comparison": "قضاوت",
    "challenge": "چالشی", "direct": "مستقیم",
}
TIER_LABELS = {1: "آسان", 2: "متوسط", 3: "سخت", 4: "خبره"}


def build():
    curriculum = json.load(open(os.path.join(HERE, "..", "curriculum.json")))
    skills = {s["id"]: s for s in curriculum["skills"]}
    section_of_skill = {}
    for ch in curriculum["chapters"]:
        for ls in ch["lessons"]:
            for sk in ls["skills"]:
                section_of_skill[sk] = (ch["id"], ls["id"], ls["sourcePages"])

    bank = []
    failures = []
    per_skill = {}
    dup_rejected = 0
    cap_rejected = 0
    template_counts = {}
    fingerprints = {}     # (skill, fp) -> id (near-dup detection)

    def register(skill, q, is_v2, skill_seq, gen_tag):
        """shared post-processing; returns entry or rejection reason."""
        nonlocal dup_rejected, cap_rejected
        # ---- family / tier / template
        if is_v2:
            family = q["family"]
            tier = q["tier"]
            template = q["template"]
        else:
            family = LEGACY_FAMILY.get(q.get("questionType"), "direct")
            tier = q["difficulty"]
            template = "legacy-" + q.get("questionType", "x")
        # ---- difficulty/tier bounds
        if tier not in (1, 2, 3, 4):
            return f"bad tier {tier}"
        # ---- structural check (comparison family legitimately has 3 options)
        errs = validators.structural_check(q)
        if errs and family == "comparison" and q.get("questionType") == "comparison":
            errs = [e for e in errs if "options count" not in e and "duplicate option" not in e]
            if len({k for _, k in q["options"]}) != 3:
                errs.append("comparison must have exactly 3 distinct options")
        if errs:
            return "; ".join(errs[:3])
        # ---- independent verification
        if is_v2:
            errs = validators3.verify2(q)
        else:
            errs = validators.verify(q)
        if errs:
            return "; ".join(errs[:3])
        # ---- structural fingerprint & caps
        fp = validators3.fingerprint(q["question"])
        tmpl_key = (skill, template)
        if template_counts.get(tmpl_key, 0) >= TEMPLATE_CAP:
            cap_rejected += 1
            return None          # silent: template quota full (variety guard)
        dup_key = (skill, fp)
        if fingerprints.get(dup_key, 0) >= FP_DUP_LIMIT:
            dup_rejected += 1
            return None          # silent: structural near-duplicate (limit reached)
        template_counts[tmpl_key] = template_counts.get(tmpl_key, 0) + 1
        fingerprints[dup_key] = fingerprints.get(dup_key, 0) + 1
        correct_index_pre = [k for _, k in q["options"]].index(q["correctKey"])
        # ---- ids / metadata
        ch_id, sec_id, pages = section_of_skill[skill]
        meta = skills[skill]
        if is_v2:
            qid = f"q2-{skill}-{family}-{skill_seq:03d}"
        else:
            qid = f"q-{skill}-{skill_seq:03d}"
        book_page = pages[len(pages) // 2]
        # ---- option feedback aligned to final order
        # (the CORRECT option never carries mistake feedback, by construction)
        feedback_map = q.get("_feedback") or {}
        option_feedback = []
        for i, (html, key) in enumerate(q["options"]):
            if i == correct_index_pre:
                option_feedback.append("")
            else:
                option_feedback.append(feedback_map.get(key, ""))
        entry = {
            "id": qid,
            "chapterId": ch_id,
            "sectionId": sec_id,
            "skill": skill,
            "skillName": meta["name"],
            "sourcePages": pages,
            "bookPage": book_page,
            "family": family,
            "familyLabel": FAMILY_LABELS[family],
            "tier": tier,
            "tierLabel": TIER_LABELS[tier],
            "template": template,
            "fingerprint": fp,
            "difficulty": tier,
            "questionType": q["questionType"],
            "question": q["question"],
            "options": [h for h, _ in q["options"]],
            "correctIndex": [k for _, k in q["options"]].index(q["correctKey"]),
            "correctAnswer": str([k for _, k in q["options"]].index(q["correctKey"]) + 1),
            "solution": q["solution"],
            "conceptHint": q["conceptHint"],
            "conceptExplanation": meta["concept"],
            "commonMistake": meta["mistakes"][skill_seq % len(meta["mistakes"])],
            "optionFeedback": option_feedback,
            "estimatedSeconds": (EST_SECONDS_V2 if is_v2 else EST_SECONDS_LEGACY).get(
                tier, 45),
            "masteryWeight": MASTERY_WEIGHT.get(tier, 1.0),
        }
        bank.append(entry)
        return entry

    skill_seq = {}
    per_family = {}
    per_tier = {1: 0, 2: 0, 3: 0, 4: 0}
    definitional_count = 0

    for skill, fn, n_variants in GENERATOR_LIST:
        if skill not in skills:
            failures.append({"skill": skill, "id": "-", "errors": ["skill not in curriculum"]})
            continue
        is_v2 = (fn.__module__ == "generators3")
        ok_count = 0
        gen_idx = 0
        for i in range(n_variants):
            rng = random.Random(f"{skill}#{skill}-{gen_idx}-{i}" if not is_v2
                                else f"{skill}#v2-{gen_idx}-{i}")
            gen_idx += 1
            try:
                q = fn(rng)
            except Exception as ex:
                failures.append({"skill": skill, "id": f"{skill}#{i}",
                                 "errors": [f"generator exception: {type(ex).__name__}: {ex}"]})
                continue
            # shuffle options deterministically
            options = list(q["options"])
            rng.shuffle(options)
            q = dict(q, options=options)
            skill_seq[skill] = skill_seq.get(skill, 0) + 1
            res = register(skill, q, is_v2, skill_seq[skill], gen_idx)
            if res is None:
                continue           # variety-guard rejection
            if isinstance(res, str):
                failures.append({"skill": skill, "id": f"{skill}#{i}", "errors": [res]})
                continue
            ok_count += 1
            fam = res["family"]
            per_family[fam] = per_family.get(fam, 0) + 1
            per_tier[res["tier"]] += 1
            if isinstance(q.get("_verify"), dict) and "definitional" in q["_verify"]:
                definitional_count += 1
        per_skill[skill] = per_skill.get(skill, {"generated": 0, "passed": 0, "failed": 0,
                                                 "v2passed": 0, "templates": set(), "families": set()})
        per_skill[skill]["generated"] += n_variants
        per_skill[skill]["passed"] += ok_count
        per_skill[skill]["failed"] += n_variants - ok_count
        if is_v2:
            per_skill[skill]["v2passed"] += ok_count

    for e in bank:
        ps = per_skill[e["skill"]]
        ps["templates"].add(e["template"])
        ps["families"].add(e["family"])
    for k, v in per_skill.items():
        v["templates"] = len(v["templates"])
        v["families"] = len(v["families"])

    # ---------------- write question bank ----------------
    with open(os.path.join(HERE, "..", "question_bank.json"), "w", encoding="utf-8") as f:
        json.dump({"version": 2, "totalQuestions": len(bank), "questions": bank},
                  f, ensure_ascii=False)

    # ---------------- validation report v2 ----------------
    report = {
        "version": 2,
        "totalGenerated": sum(v["generated"] for v in per_skill.values()),
        "totalPassed": len(bank),
        "totalFailed": len(failures),
        "nearDuplicatesRejected": dup_rejected,
        "templateCapRejections": cap_rejected,
        "passRate": round(100.0 * len(bank) / max(1, sum(v["generated"] for v in per_skill.values())), 2),
        "families": {FAMILY_LABELS.get(k, k): v for k, v in per_family.items()},
        "tiers": {TIER_LABELS[k]: v for k, v in per_tier.items()},
        "definitionalStatements": definitional_count,
        "perSkill": per_skill,
        "failures": failures[:200],
        "validationMethods": [
            "legacy kinds: validators.py (iteration, brute-force enumeration, Horner, point-sampling, Vieta, statistics module)",
            "v2 families: validators3.py — first-wrong-step consistency for error-id",
            "v2 comparison: witness re-derivation (surd arithmetic from squarefree structure, sign/monotonic numeric probes)",
            "v2 counting/probability: full outcome-space enumeration with itertools",
            "v2 reverse/multi-step: independent re-solve by iteration or substitution probes",
            "near-duplicate rejection: digit-stripped structural fingerprint (sha1) per skill",
            "structural variety: per-(skill, template) cap of %d questions" % TEMPLATE_CAP,
            "structural checks: 4 unique options, single correct key, balanced HTML, no placeholders",
        ],
    }
    with open(os.path.join(HERE, "..", "question_validation_report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)

    # ---------------- coverage report ----------------
    book = json.load(open(os.path.join(HERE, "..", "book_pages.json")))
    cov_chapters = []
    for ch in curriculum["chapters"]:
        qs = [q for q in bank if q["chapterId"] == ch["id"]]
        lessons = []
        for ls in ch["lessons"]:
            lq = [q for q in qs if q["sectionId"] == ls["id"]]
            verif = next(v for v in book["lesson_verification"]
                         if v["chapter"] == ch["number"] and v["lesson"] == ls["lesson"])
            lessons.append({
                "id": ls["id"], "name": ls["name"], "sourcePages": ls["sourcePages"],
                "pdfPagesVerified": verif["verified"],
                "skills": ls["skills"], "questionCount": len(lq),
                "difficultySpread": {str(d): sum(1 for q in lq if q["difficulty"] == d) for d in (1, 2, 3, 4)},
            })
        cov_chapters.append({
            "id": ch["id"], "number": ch["number"], "name": ch["name"],
            "sourcePages": ch["sourcePages"], "lessons": lessons,
            "questionCount": len(qs),
            "skills": [s["id"] for s in curriculum["skills"] if s["chapter"] == ch["number"]],
        })
    missing = [l["id"] for c in cov_chapters for l in c["lessons"] if l["questionCount"] == 0]
    coverage = {
        "book": {"title": "ریاضی (۱) پایه دهم", "code": "110211",
                 "pdfPages": book["pdf_pages"], "bodyPages": book["body_pages"],
                 "scannedPages": len(book["scanned_pages"]),
                 "extractedChars": book["total_extracted_chars"],
                 "pedagogicalBlocks": book["pedagogical_blocks"]},
        "chaptersCovered": f"{len(cov_chapters)}/7",
        "lessonsCovered": f"{sum(1 for c in cov_chapters for l in c['lessons'] if l['questionCount'] > 0)}/23",
        "totalQuestions": len(bank),
        "chapters": cov_chapters,
        "lessonsMissingQuestions": missing,
        "skillsWithoutGenerators": [s["id"] for s in curriculum["skills"]
                                    if s["id"] not in per_skill or per_skill[s["id"]]["passed"] == 0],
    }
    with open(os.path.join(HERE, "..", "book_coverage_report.json"), "w", encoding="utf-8") as f:
        json.dump(coverage, f, ensure_ascii=False, indent=1)

    print(f"bank v2: {len(bank)} questions (legacy+intelligent), failures: {len(failures)}")
    print("families:", {FAMILY_LABELS.get(k, k): v for k, v in per_family.items()})
    print("tiers:", {TIER_LABELS[k]: v for k, v in per_tier.items()})
    print(f"near-dup rejected: {dup_rejected}, template-cap rejected: {cap_rejected}")
    for f_ in failures[:25]:
        print("  FAIL", f_["skill"], f_["id"], f_["errors"][:2])
    print(f"chapters covered: {coverage['chaptersCovered']}, lessons: {coverage['lessonsCovered']}")
    print("missing lessons:", missing or "none")
    print("skills without generators:", coverage["skillsWithoutGenerators"] or "none")
    return len(bank), failures


if __name__ == "__main__":
    build()
