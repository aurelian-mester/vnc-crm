#!/bin/bash
PGPASSWORD=5324 psql -h 172.16.75.97 -U biusr -d dwh -c "
SELECT DISTINCT l.\"No.\", a.\"Number\", bg.\"Code\" as board_grade
FROM ss01.salesinvoiceline_v l
INNER JOIN ss02.articles a ON l.\"No.\" = a.\"Number\"
INNER JOIN ss02.boardgrades bg ON a.\"BoardGradeID\" = bg.\"ID\"
LIMIT 10;
"
