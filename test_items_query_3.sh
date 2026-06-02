#!/bin/bash
PGPASSWORD=5324 psql -h 172.16.75.97 -U biusr -d dwh -c "
SELECT * FROM (
	SELECT
		i.\"Customer\",
		i.\"No.\",
		i.\"Description\",
		i.\"Item Category Code\",
		p.\"Unit Price\" AS \"PretUnitar\",
		p.\"VAT Prod. Posting Group\",
		row_number() over (partition by i.\"No.\" order by i.\"Modified At\" desc) as \"rn\"
	FROM
		ss01.\"item\" i
	LEFT JOIN
		ss01.\"pricelistline\" p
		ON i.\"No.\" = p.\"Product No.\"
	WHERE
		p.\"Assign-to No.\" Like 'C000605'
		AND p.\"VAT Prod. Posting Group\" LIKE 'BUNURI%'
		AND p.\"Product No.\" NOT LIKE 'MS%'
		AND p.\"Product No.\" NOT LIKE 'S%'
		AND i.\"Unit Price\" IS NOT NULL
		AND i.\"Item Category Code\" IN ('CO.PLACI', 'CO.CUTII')
) a WHERE \"rn\" = 1
LIMIT 5;
"
