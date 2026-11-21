from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

out = 'Project_24I-3030_24I-3079_24I-3114_C.pdf'
doc = SimpleDocTemplate(out, pagesize=A4, rightMargin=2*cm, leftMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm)
styles = getSampleStyleSheet()
story = [Paragraph('SE3002 Software Quality Engineering - Final Project', styles['Title'])]

def section(title, text):
    story.extend([Spacer(1, 10), Paragraph(title, styles['Heading2']), Paragraph(text, styles['BodyText'])])

section('Group', 'Burhan Ahmed (24I-3030), Ali Akbar (24I-3079), Huzaifa Ali (24I-3114), Section C')
section('Repository and scope',
        'Upstream: https://github.com/akolit/MuseumOS<br/>'
        'License: AGPL-3.0<br/>'
        'Baseline commit: 0ef7004ebef1c59130101fa0a56c95a50ca31900<br/>'
        'Workflows: (W1) create an exhibit; (W2) validate and publish an exhibit. '
        'The shared record is the exhibit ID and lifecycle fields.')
section('Roles and business rules',
        'Roles: viewer (read only), curator (read/write), senior curator/admin (validate; admin has all permissions). '
        'Rules: year is null or 1800-2100; price is null or non-negative; publishing requires validation plus name and category; '
        'published is a terminal state.')
section('Test management',
        'The test plan, risk register, traceability matrix, defect evidence, AI-use record, and performance/recovery plan '
        'are included in docs/team/. Entry criteria are documented setup plus a passing API health check. '
        'Release recommendation: hold until Playwright, Lighthouse, axe, k6, mutation, and Sonar evidence are completed on the final machine.')

section('Verified evidence',
        'Unit: 7/7 exhibit lifecycle tests passed. API: login 200, health 200, create 201, unvalidated publish rejected 400, '
        'validate/publish/read-back passed. Generated data: year values 1799/1800/1801/2099/2100/2101 and price values -0.01/0/0.01/999.99/1000.')

section('Defect DEF-001',
        'An unvalidated exhibit could be published. Root cause: independent Zod/Patch fields had no server transition invariant. '
        'Fix: added a lifecycle guard to the exhibit update controller and a team unit module. '
        'Severity: major; priority: P1; status: fixed.')

section('Release criteria',
        '1. Exhibit lifecycle unit/branch coverage: target 100%; measured module branch coverage: 85%. '
        '2. High-risk API cases: target 100% pass; verified create/reject/validate/publish/read-back. '
        '3. Performance: p95 <= 500 ms and unexpected failures < 1%; k6 scripts prepared but comparable runs are pending.')

story.append(Spacer(1, 10))
story.append(Paragraph('Area ownership', styles['Heading2']))
rows = [
    ['Member', 'Area'],
    ['Burhan Ahmed', 'Static analysis, white-box, mutation and CI'],
    ['Ali Akbar', 'API testing and OpenAPI test data generation'],
    ['Huzaifa Ali', 'Use cases, accessibility, security and performance'],
]
table = Table(rows, colWidths=[5*cm, 10*cm])
table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.grey), ('TEXTCOLOR',(0,0),(-1,0),colors.white),
                           ('GRID',(0,0),(-1,-1),1,colors.black), ('VALIGN',(0,0),(-1,-1),'TOP')]))
story.append(table)
doc.build(story)
print(out)
