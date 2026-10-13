import { useEffect, useState } from "react";
import { IndianRupee, Loader2, Plus, X } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

// The backend GigCreate/GigUpdate schema accepts exactly six fields:
// title, description, budget (int), location (str), category (str), skills (str[]).
// Category and location are free-text on the server, so the lists below are
// presentation choices only and "Other" always falls back to a text input.
const CATEGORY_GROUPS = [
  {
    label: "Engineering",
    options: [
      "Development",
      "Frontend Development",
      "Backend Development",
      "Mobile Development",
      "DevOps & Cloud",
      "QA & Testing",
      "Data & Analytics",
      "AI & Machine Learning",
      "Blockchain",
    ],
  },
  {
    label: "Design & Creative",
    options: [
      "Design",
      "UI/UX Design",
      "Graphic Design",
      "Motion & Animation",
      "Video Editing",
      "Photography",
    ],
  },
  {
    label: "Growth & Content",
    options: [
      "Marketing",
      "Content Writing",
      "SEO",
      "Social Media",
      "Sales & Business Development",
    ],
  },
  {
    label: "Business & Ops",
    options: [
      "Finance & Accounting",
      "Operations",
      "Human Resources",
      "Legal",
      "Customer Support",
      "Teaching & Tutoring",
    ],
  },
];

const LOCATION_GROUPS = [
  { label: "Anywhere", options: ["Remote", "Hybrid", "On-site"] },
  {
    label: "Metros",
    options: [
      "Bengaluru",
      "Mumbai",
      "Delhi NCR",
      "Hyderabad",
      "Chennai",
      "Pune",
      "Kolkata",
      "Ahmedabad",
    ],
  },
  {
    label: "Other cities",
    options: [
      "Jaipur",
      "Kochi",
      "Coimbatore",
      "Indore",
      "Chandigarh",
      "Bhubaneswar",
      "Lucknow",
      "Nagpur",
      "Thiruvananthapuram",
      "Visakhapatnam",
    ],
  },
];

// Quick-add chips shown under the skills field, keyed by category keyword.
const SKILL_SUGGESTIONS = {
  Development: ["React", "Node.js", "Python", "TypeScript", "PostgreSQL"],
  Frontend: ["React", "Next.js", "Tailwind CSS", "TypeScript", "Vue"],
  Backend: ["Node.js", "Django", "FastAPI", "PostgreSQL", "Redis"],
  Mobile: ["React Native", "Flutter", "Swift", "Kotlin"],
  DevOps: ["AWS", "Docker", "Kubernetes", "Terraform", "CI/CD"],
  QA: ["Playwright", "Cypress", "Selenium", "Jest"],
  Data: ["SQL", "Pandas", "Power BI", "Tableau", "dbt"],
  AI: ["Python", "PyTorch", "LLMs", "RAG", "Hugging Face"],
  Blockchain: ["Solidity", "Ethers.js", "Hardhat", "Web3"],
  Design: ["Figma", "Prototyping", "Design Systems", "Wireframing"],
  Motion: ["After Effects", "Lottie", "Blender"],
  Video: ["Premiere Pro", "DaVinci Resolve", "CapCut"],
  Photography: ["Lightroom", "Product Photography", "Retouching"],
  Marketing: ["Google Ads", "Meta Ads", "Analytics", "Email Marketing"],
  Content: ["Copywriting", "Editing", "Research", "Scripting"],
  SEO: ["Keyword Research", "Technical SEO", "Link Building"],
  Social: ["Instagram", "LinkedIn", "Content Calendar", "Community"],
  Sales: ["Outbound", "CRM", "Lead Generation", "Negotiation"],
  Finance: ["Excel", "Bookkeeping", "GST", "Financial Modelling"],
  Operations: ["Process Design", "Vendor Management", "Notion"],
  Human: ["Recruiting", "Onboarding", "Payroll"],
  Legal: ["Contracts", "Compliance", "IP"],
  Customer: ["Zendesk", "Live Chat", "Escalation Handling"],
  Teaching: ["Curriculum Design", "Live Sessions", "Assessment"],
};

const OTHER = "__other__";

const EMPTY = {
  title: "",
  description: "",
  budget: 10000,
  location: "Remote",
  category: "Development",
  skills: [],
};

const flatten = (groups) => groups.flatMap((group) => group.options);
const KNOWN_CATEGORIES = flatten(CATEGORY_GROUPS);
const KNOWN_LOCATIONS = flatten(LOCATION_GROUPS);

const suggestionsFor = (category) => {
  const match = Object.keys(SKILL_SUGGESTIONS).find((key) =>
    category.toLowerCase().includes(key.toLowerCase()),
  );
  return match ? SKILL_SUGGESTIONS[match] : [];
};

const toForm = (gig) =>
  gig
    ? {
        title: gig.title || "",
        description: gig.description || "",
        budget: Number(gig.budget || 0),
        location: gig.location || "Remote",
        category: gig.category || "Development",
        skills: Array.isArray(gig.skills) ? gig.skills : [],
      }
    : { ...EMPTY };

/**
 * Create/edit dialog for a gig. `gig` switches the dialog to edit mode and the
 * caller decides whether that means POST /gigs or PATCH /gigs/{id}.
 */
export default function GigFormDialog({
  open,
  onOpenChange,
  gig = null,
  submitting = false,
  onSubmit,
}) {
  const isEdit = Boolean(gig);
  const [form, setForm] = useState(() => toForm(gig));
  const [skillDraft, setSkillDraft] = useState("");
  const [errors, setErrors] = useState({});
  const [customCategory, setCustomCategory] = useState(false);
  const [customLocation, setCustomLocation] = useState(false);

  useEffect(() => {
    if (!open) return;
    const next = toForm(gig);
    setForm(next);
    setSkillDraft("");
    setErrors({});
    // An existing gig may carry a value that is not in our lists; keep editing
    // it as free text rather than silently snapping it to a listed option.
    setCustomCategory(
      Boolean(next.category) && !KNOWN_CATEGORIES.includes(next.category),
    );
    setCustomLocation(
      Boolean(next.location) && !KNOWN_LOCATIONS.includes(next.location),
    );
  }, [open, gig]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const addSkills = (raw) => {
    const parsed = raw
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean);
    if (parsed.length === 0) return;
    setForm((prev) => ({
      ...prev,
      skills: [...new Set([...prev.skills, ...parsed])],
    }));
    setSkillDraft("");
  };

  const removeSkill = (skill) =>
    setForm((prev) => ({
      ...prev,
      skills: prev.skills.filter((item) => item !== skill),
    }));

  const validate = () => {
    const next = {};
    if (!form.title.trim()) next.title = "Give the gig a title.";
    if (!form.description.trim())
      next.description = "Describe the work so applicants can self-qualify.";
    if (!form.category.trim()) next.category = "Pick a category.";
    if (!form.location.trim()) next.location = "Set a location or Remote.";
    if (!Number.isInteger(Number(form.budget)) || Number(form.budget) <= 0)
      next.budget = "Budget must be a whole number greater than zero.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event) => {
    event.preventDefault();
    // Fold a half-typed skill into the list so it is not silently dropped.
    const skills = skillDraft.trim()
      ? [...new Set([...form.skills, skillDraft.trim()])]
      : form.skills;
    if (!validate()) return;
    await onSubmit({
      title: form.title.trim(),
      description: form.description.trim(),
      budget: Number(form.budget),
      location: form.location.trim(),
      category: form.category.trim(),
      skills,
    });
  };

  const suggestions = suggestionsFor(form.category).filter(
    (skill) => !form.skills.includes(skill),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => !submitting && onOpenChange(value)}
    >
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
        data-testid="gig-form-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {isEdit ? "Edit gig" : "Post a new gig"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the brief. Applicants keep their existing applications."
              : "Describe the work, set a budget and list the skills you need."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="gig-title">Title</Label>
            <Input
              id="gig-title"
              value={form.title}
              onChange={(event) => setField("title", event.target.value)}
              placeholder="Senior Angular developer for a 6-week build"
              className="rounded-xl"
              data-testid="gig-title-input"
            />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gig-description">Description</Label>
            <Textarea
              id="gig-description"
              rows={5}
              value={form.description}
              onChange={(event) => setField("description", event.target.value)}
              placeholder={
                "Scope and deliverables\nTimeline and time commitment\nHow you will review the work\nAnything a good applicant should mention"
              }
              className="rounded-xl"
              data-testid="gig-description-input"
            />
            <p className="text-xs text-muted-foreground">
              Timeline, duration and experience level belong here — the gig API
              stores no separate fields for them.
            </p>
            {errors.description && (
              <p className="text-xs text-destructive">{errors.description}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="gig-budget">Budget</Label>
              <div className="relative">
                <IndianRupee
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="gig-budget"
                  type="number"
                  min={1}
                  step={1}
                  value={form.budget}
                  onChange={(event) => setField("budget", event.target.value)}
                  className="rounded-xl pl-8"
                  data-testid="gig-budget-input"
                />
              </div>
              {errors.budget ? (
                <p className="text-xs text-destructive">{errors.budget}</p>
              ) : (
                Number(form.budget) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Rs {Number(form.budget).toLocaleString("en-IN")}
                  </p>
                )
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="gig-category">Category</Label>
              {customCategory ? (
                <div className="flex gap-1.5">
                  <Input
                    id="gig-category"
                    autoFocus
                    value={form.category}
                    onChange={(event) =>
                      setField("category", event.target.value)
                    }
                    placeholder="Your own category"
                    className="rounded-xl"
                    data-testid="gig-category-input"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className="shrink-0 rounded-xl px-2"
                    onClick={() => {
                      setCustomCategory(false);
                      setField("category", "Development");
                    }}
                    aria-label="Back to category list"
                  >
                    <X size={15} />
                  </Button>
                </div>
              ) : (
                <Select
                  value={form.category}
                  onValueChange={(value) => {
                    if (value === OTHER) {
                      setCustomCategory(true);
                      setField("category", "");
                      return;
                    }
                    setField("category", value);
                  }}
                >
                  <SelectTrigger
                    className="rounded-xl"
                    data-testid="gig-category-select"
                  >
                    <SelectValue placeholder="Pick a category" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {CATEGORY_GROUPS.map((group) => (
                      <SelectGroup key={group.label}>
                        <SelectLabel>{group.label}</SelectLabel>
                        {group.options.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                    <SelectItem value={OTHER}>Other...</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {errors.category && (
                <p className="text-xs text-destructive">{errors.category}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gig-location">Location</Label>
            {customLocation ? (
              <div className="flex gap-1.5">
                <Input
                  id="gig-location"
                  autoFocus
                  value={form.location}
                  onChange={(event) => setField("location", event.target.value)}
                  placeholder="City, or how the work happens"
                  className="rounded-xl"
                  data-testid="gig-location-input"
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="shrink-0 rounded-xl px-2"
                  onClick={() => {
                    setCustomLocation(false);
                    setField("location", "Remote");
                  }}
                  aria-label="Back to location list"
                >
                  <X size={15} />
                </Button>
              </div>
            ) : (
              <Select
                value={form.location}
                onValueChange={(value) => {
                  if (value === OTHER) {
                    setCustomLocation(true);
                    setField("location", "");
                    return;
                  }
                  setField("location", value);
                }}
              >
                <SelectTrigger
                  className="rounded-xl"
                  data-testid="gig-location-select"
                >
                  <SelectValue placeholder="Pick a location" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {LOCATION_GROUPS.map((group) => (
                    <SelectGroup key={group.label}>
                      <SelectLabel>{group.label}</SelectLabel>
                      {group.options.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                  <SelectItem value={OTHER}>Other...</SelectItem>
                </SelectContent>
              </Select>
            )}
            {errors.location && (
              <p className="text-xs text-destructive">{errors.location}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gig-skills">Skills</Label>
            <Input
              id="gig-skills"
              value={skillDraft}
              onChange={(event) => setSkillDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  addSkills(skillDraft);
                }
              }}
              onBlur={() => addSkills(skillDraft)}
              placeholder="Type a skill and press Enter"
              className="rounded-xl"
              data-testid="gig-skills-input"
            />
            {form.skills.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {form.skills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium"
                    data-testid={`gig-skill-${skill}`}
                  >
                    {skill}
                    <button
                      type="button"
                      onClick={() => removeSkill(skill)}
                      className="text-muted-foreground transition-colors hover:text-destructive"
                      aria-label={`Remove ${skill}`}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {suggestions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-xs text-muted-foreground">Suggested:</span>
                {suggestions.map((skill) => (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => addSkills(skill)}
                    className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                    data-testid={`gig-skill-suggestion-${skill}`}
                  >
                    <Plus size={10} /> {skill}
                  </button>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="rounded-full"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="rounded-full"
              disabled={submitting}
              data-testid="gig-submit-btn"
            >
              {submitting && (
                <Loader2 size={14} className="mr-1.5 animate-spin" />
              )}
              {submitting
                ? isEdit
                  ? "Saving..."
                  : "Posting..."
                : isEdit
                  ? "Save changes"
                  : "Post gig"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
