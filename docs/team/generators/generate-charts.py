from pathlib import Path
import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'docs' / 'team' / 'evidence' / 'charts'
OUT.mkdir(parents=True, exist_ok=True)

NAVY = '#17324d'
BLUE = '#2864a0'
TEAL = '#1b7a78'
AMBER = '#d97706'
RED = '#b91c1c'
SLATE = '#475569'
PALE = '#edf4f9'


def make_cfg_chart():
    fig, ax = plt.subplots(figsize=(10, 6.2), dpi=200)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 7.6)
    ax.axis('off')
    ax.set_title(
        'Control-Flow Graph: validateExhibitTransition (V(G) = 9; Module Total = 22)',
        fontsize=12.5, fontweight='bold', color=NAVY, pad=10,
    )

    nodes = {
        'N1': (2.2, 6.8, 'N1: name.trim().length === 0 ?', PALE, NAVY),
        'R1': (7.2, 6.8, 'R1: Reject\n"Exhibit name is required"', '#fee2e2', RED),
        'N2': (2.2, 5.5, 'N2: categoryId === null ?', PALE, NAVY),
        'R2': (7.2, 5.5, 'R2: Reject\n"A category is required"', '#fee2e2', RED),
        'N3': (2.2, 4.2, 'N3: Derive current & next state\n(2 ternaries)', PALE, NAVY),
        'N4': (2.2, 2.9, 'N4: next === "published"\n&& !isPublishAllowed(...) ?', PALE, NAVY),
        'R3': (7.2, 2.9, 'R3: Reject\n"Must be validated first"', '#fee2e2', RED),
        'N5': (2.2, 1.6, 'N5: current === "published"\n&& next !== "published" ?', PALE, NAVY),
        'R4': (7.2, 1.6, 'R4: Reject\n"Terminal published state"', '#fee2e2', RED),
        'A1': (2.2, 0.45, 'A1: Return { allowed: true }', '#dcfce7', '#166534'),
    }

    for key, (x, y, text, bg, edge) in nodes.items():
        w, h = (3.4, 0.72) if key.startswith('R') else (3.6, 0.72)
        box = FancyBboxPatch(
            (x - w / 2, y - h / 2), w, h,
            boxstyle='round,pad=0.06,rounding_size=0.12',
            facecolor=bg, edgecolor=edge, linewidth=1.4,
        )
        ax.add_patch(box)
        ax.text(x, y, text, ha='center', va='center', fontsize=8.5, color=edge, fontweight='bold')

    def arrow(p1, p2, label='', lx=0, ly=0, color=SLATE):
        ax.annotate(
            '', xy=p2, xytext=p1,
            arrowprops=dict(arrowstyle='->', color=color, lw=1.4, shrinkA=2, shrinkB=2),
        )
        if label:
            ax.text((p1[0] + p2[0]) / 2 + lx, (p1[1] + p2[1]) / 2 + ly, label,
                    fontsize=8, color=color, fontweight='bold', ha='center', va='center')

    arrow((4.0, 6.8), (5.5, 6.8), 'T', ly=0.2, color=RED)
    arrow((2.2, 6.44), (2.2, 5.86), 'F', lx=-0.22)
    arrow((4.0, 5.5), (5.5, 5.5), 'T', ly=0.2, color=RED)
    arrow((2.2, 5.14), (2.2, 4.56), 'F', lx=-0.22)
    arrow((2.2, 3.84), (2.2, 3.26), '')
    arrow((4.0, 2.9), (5.5, 2.9), 'T', ly=0.2, color=RED)
    arrow((2.2, 2.54), (2.2, 1.96), 'F', lx=-0.22)
    arrow((4.0, 1.6), (5.5, 1.6), 'T', ly=0.2, color=RED)
    arrow((2.2, 1.24), (2.2, 0.81), 'F', lx=-0.22, color='#166534')

    ax.text(
        7.2, 0.45,
        'Complexity Formula:\n'
        'validateExhibitTransition: 1 base + 4 if + 2 (?:) + 2 (&&) = 9\n'
        'All 5 functions in exhibit-workflow.ts: 4 + 3 + 3 + 3 + 9 = 22\n'
        'SonarQube Reported Complexity = 22 (Exact Match)',
        ha='center', va='center', fontsize=8.2, color=NAVY,
        bbox=dict(boxstyle='round,pad=0.4', facecolor='#f8fafc', edgecolor=BLUE, lw=1.1),
    )

    fig.tight_layout()
    fig.savefig(OUT / 'cfg-validate-transition.png', dpi=200)
    plt.close(fig)


def make_risk_heatmap():
    grid = [
        [1, 2, 3, 4, 5],
        [2, 4, 6, 8, 10],
        [3, 6, 9, 12, 15],
        [4, 8, 12, 16, 20],
        [5, 10, 15, 20, 25],
    ]
    labels = {
        (4, 4): 'P1 (25)',
        (4, 3): 'P2, Q1 (20)',
        (4, 2): 'P4, P5,\nP6, Q2 (15)',
        (3, 3): 'P3 (16)',
        (3, 2): 'P7, P8 (12)',
    }
    cell_colors = [
        ['#dcfce7', '#dcfce7', '#dcfce7', '#dcfce7', '#fef9c3'],
        ['#dcfce7', '#dcfce7', '#fef9c3', '#fef9c3', '#fed7aa'],
        ['#dcfce7', '#fef9c3', '#fef9c3', '#fed7aa', '#fed7aa'],
        ['#dcfce7', '#fef9c3', '#fed7aa', '#fed7aa', '#fecaca'],
        ['#fef9c3', '#fed7aa', '#fed7aa', '#fecaca', '#fca5a5'],
    ]

    fig, ax = plt.subplots(figsize=(7.5, 4.8), dpi=200)
    ax.set_xlim(0, 5)
    ax.set_ylim(0, 5)
    for r in range(5):
        for c in range(5):
            ax.add_patch(mpatches.Rectangle((c, r), 1, 1, facecolor=cell_colors[r][c], edgecolor='white', lw=2))
            score = grid[r][c]
            txt = labels.get((r, c), '')
            ax.text(c + 0.5, r + (0.72 if txt else 0.5), str(score), ha='center', va='center',
                    fontsize=9, color=SLATE, fontweight='bold')
            if txt:
                ax.text(c + 0.5, r + 0.34, txt, ha='center', va='center',
                        fontsize=8, color=NAVY, fontweight='bold')

    ax.set_xticks([0.5, 1.5, 2.5, 3.5, 4.5])
    ax.set_xticklabels(['1 Rare', '2 Unlikely', '3 Possible', '4 Likely', '5 Almost\nCertain'], fontsize=8.5)
    ax.set_yticks([0.5, 1.5, 2.5, 3.5, 4.5])
    ax.set_yticklabels(['1 Negligible', '2 Minor', '3 Moderate', '4 Major', '5 Critical'], fontsize=8.5)
    ax.set_xlabel('Likelihood', fontsize=9.5, fontweight='bold', color=NAVY)
    ax.set_ylabel('Impact', fontsize=9.5, fontweight='bold', color=NAVY)
    ax.set_title('5x5 Product & Project Risk Matrix (10 Risks Mapped)', fontsize=11.5, fontweight='bold', color=NAVY, pad=10)
    fig.tight_layout()
    fig.savefig(OUT / 'risk-heatmap.png', dpi=200)
    plt.close(fig)


def make_fishbone(filename, title, effect, categories):
    fig, ax = plt.subplots(figsize=(9.5, 4.8), dpi=200)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 6)
    ax.axis('off')
    ax.set_title(title, fontsize=11.5, fontweight='bold', color=NAVY, pad=8)

    # Spine
    ax.annotate('', xy=(7.6, 3.0), xytext=(0.4, 3.0), arrowprops=dict(arrowstyle='->', lw=2.2, color=NAVY))
    head = FancyBboxPatch((7.65, 2.35), 2.15, 1.3, boxstyle='round,pad=0.08,rounding_size=0.12',
                          facecolor='#fee2e2', edgecolor=RED, lw=1.6)
    ax.add_patch(head)
    ax.text(8.72, 3.0, effect, ha='center', va='center', fontsize=8.5, fontweight='bold', color=RED)

    top_x = [2.0, 4.4, 6.7]
    bot_x = [2.0, 4.4, 6.7]
    for idx, (cat, causes) in enumerate(categories):
        is_top = idx < 3
        x_spine = (top_x if is_top else bot_x)[idx % 3]
        x_tip = x_spine - 1.1
        y_tip = 5.3 if is_top else 0.7
        ax.plot([x_tip, x_spine], [y_tip, 3.0], color=BLUE, lw=1.6)
        ax.text(x_tip, y_tip + (0.25 if is_top else -0.28), cat, ha='center', va='center',
                fontsize=9, fontweight='bold', color=NAVY,
                bbox=dict(boxstyle='round,pad=0.22', facecolor=PALE, edgecolor=BLUE, lw=1))
        for j, cause in enumerate(causes):
            t = 0.32 + j * 0.3
            cx = x_tip + t * (x_spine - x_tip)
            cy = y_tip + t * (3.0 - y_tip)
            ax.plot([cx - 0.7, cx], [cy, cy], color=SLATE, lw=1.0)
            ax.text(cx - 0.74, cy, cause, ha='right', va='center', fontsize=7.5, color=SLATE)

    fig.tight_layout()
    fig.savefig(OUT / filename, dpi=200)
    plt.close(fig)


def make_pareto_chart():
    categories = [
        'Missing Business / Security\nInvariant Enforcement\n(DEF-001, DEF-003)',
        'DB Setup & Schema Drift\n(DEF-002)',
        'UI Accessibility & Contrast\n(5 A11y Fixes)',
        'Legacy Lint / Static Hygiene\n(Fixed)',
    ]
    # Use confirmed functional/security defects for strict defect Pareto + note secondary findings separately
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10.2, 4.2), dpi=200)

    # Panel A: Confirmed Major Defects Pareto
    def_cats = ['Missing Invariant\nEnforcement\n(DEF-001, DEF-003)', 'DB Setup &\nSchema Drift\n(DEF-002)']
    counts = [2, 1]
    cum = [66.7, 100.0]
    ax1.bar(def_cats, counts, color=[NAVY, BLUE], width=0.5)
    ax1.set_ylim(0, 2.6)
    ax1.set_ylabel('Confirmed Major Defects', color=NAVY, fontweight='bold', fontsize=8.5)
    ax1.set_title('Confirmed Major Defects Pareto (n=3)', fontsize=10, fontweight='bold', color=NAVY)
    ax1_r = ax1.twinx()
    ax1_r.plot(def_cats, cum, color=AMBER, marker='o', lw=2)
    ax1_r.set_ylim(0, 115)
    ax1_r.set_ylabel('Cumulative %', color=AMBER, fontweight='bold', fontsize=8.5)
    for i, (c, p) in enumerate(zip(counts, cum)):
        ax1.text(i, c + 0.08, f'{c}', ha='center', fontsize=8.5, fontweight='bold', color=NAVY)
        ax1_r.text(i, p + 4, f'{p:.1f}%', ha='center', fontsize=8, fontweight='bold', color=AMBER)

    # Panel B: k6 Performance vs 500ms Target
    k6_files = ['k6-1u-1.json', 'k6-1u-2.json', 'k6-5u-1.json', 'k6-5u-2.json']
    labels = ['1 VU\nRun 1', '1 VU\nRun 2', '5 VUs\nRun 1', '5 VUs\nRun 2']
    p95s = []
    for name in k6_files:
        d = json.loads((ROOT / 'docs' / 'team' / 'evidence' / 'performance' / name).read_text())
        p95s.append(d['metrics']['http_req_duration']['p(95)'])

    ax2.bar(labels, p95s, color=[TEAL, TEAL, BLUE, BLUE], width=0.52)
    ax2.axhline(500, color=RED, ls='--', lw=1.4, label='Acceptance Limit (500 ms)')
    ax2.set_ylim(0, 60)
    ax2.set_ylabel('p95 Latency (ms)', color=NAVY, fontweight='bold', fontsize=8.5)
    ax2.set_title('k6 Authenticated Read p95 Latency (0% Errors)', fontsize=10, fontweight='bold', color=NAVY)
    for i, val in enumerate(p95s):
        ax2.text(i, val + 1.5, f'{val:.2f} ms', ha='center', fontsize=8, fontweight='bold', color=NAVY)
    ax2.text(1.5, 48, 'Target ceiling: 500 ms (all runs < 6% of budget)', ha='center', fontsize=8, color=RED,
             bbox=dict(boxstyle='round,pad=0.25', facecolor='#fef2f2', edgecolor=RED, lw=0.8))

    fig.tight_layout()
    fig.savefig(OUT / 'pareto-and-k6.png', dpi=200)
    plt.close(fig)


def main():
    make_cfg_chart()
    make_risk_heatmap()
    make_fishbone(
        'fishbone-def001.png',
        'Fishbone RCA: DEF-001 (Unvalidated Exhibit Published) & DEF-003 (Curator Lifecycle Bypass)',
        'Lifecycle & RBAC\nBypass (DEF-001/003)',
        [
            ('Requirements', ['State invariant omitted', 'Validate perm unmapped']),
            ('Design', ['State not modeled', 'DTO mixed flags']),
            ('Implementation', ['Direct boolean PATCH', 'No guard on validated']),
            ('Tests', ['No negative transition', 'No negative role test']),
            ('Process', ['Schema-only review']),
        ],
    )
    make_fishbone(
        'fishbone-def002.png',
        'Fishbone RCA: DEF-002 (Full-Text Search 500 & Schema Drift)',
        'Search 500 &\nStale tsvector',
        [
            ('Setup / SQL', ['Multi-cmd rejected', 'Prepared stmt limit']),
            ('Code', ['Seed swallowed error', 'No fail-fast throw']),
            ('Schema', ['IF NOT EXISTS skipped', 'Plain column stayed']),
            ('Verification', ['No post-seed check']),
            ('Tests', ['No mutable FTS test']),
        ],
    )
    make_pareto_chart()
    print(f'Generated charts in {OUT}')


if __name__ == '__main__':
    main()
