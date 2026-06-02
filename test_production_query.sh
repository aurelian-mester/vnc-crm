#!/bin/bash
PGPASSWORD=5324 psql -h 172.16.75.97 -U biusr -d dwh -c "
SELECT
    ROW_NUMBER() OVER (ORDER BY c.\"Code\") as \"Nr.Crt.\",
    COALESCE(a.\"Number\", '') AS \"Cod Articol\",
    COALESCE(a.\"Description\", '') as \"Nume Articol\",
    COALESCE(o.\"OrderNumber\", '') || ' ' || COALESCE(o.\"PartNumber\", '') AS \"Numar comanda\",
    COALESCE(o.\"OrderedQuantity\", 0) as \"Cantitate\",
    CASE
        WHEN m.\"MachineType\" > 1
            THEN op.\"TotalQuantity\"
        ELSE SUM(FLOOR(
            (CASE WHEN cb.\"RunMeters\" IS NOT NULL AND cb.\"RunMeters\" > 0 THEN cb.\"RunMeters\" ELSE 0 END) * 1000.0 /
            (CASE WHEN o.\"GivenSheetLength\" IS NOT NULL THEN o.\"GivenSheetLength\" ELSE a.\"SheetLength\" END))
            * co.\"Outs\" * op.\"M0Divisor\")
    END AS \"Cantitate produsa\",
    cast(op.\"ScheduleDate\" as text) as \"Data planificata\",
    CASE
        WHEN op.\"Status\" = 2
            THEN CASE
                WHEN m.\"MachineType\" > 1 THEN cast(op.\"EndRun\" as text)
                ELSE cast(MAX(cb.\"EndRun\") as text)
            END
        ELSE NULL
    END AS \"Data productie\"
FROM ss02.\"operations\" op
INNER JOIN ss02.\"orders\" o ON o.\"ID\" = op.\"OrderID\"
INNER JOIN ss02.\"customers\" c ON c.\"ID\" = o.\"CustomerID\"
INNER JOIN ss02.\"articles\" a ON a.\"ID\" = o.\"ArticleID\"
INNER JOIN ss02.\"boardgrades\" bg ON bg.\"ID\" = a.\"BoardGradeID\"
INNER JOIN ss02.\"machines\" m ON m.\"ID\" = op.\"MachineID\"
LEFT OUTER JOIN ss02.\"combinationorders\" co ON co.\"OperationID\" = op.\"ID\"
LEFT OUTER JOIN ss02.\"combinations\" cb ON cb.\"ID\" = co.\"CombinationID\"
WHERE 
    o.\"CreationDate\" >  cast((current_timestamp - INTERVAL '18 months') as date)
    AND op.\"IsLastReal\" = True
    AND LEFT(c.\"Code\",1) like 'C%'
    AND c.\"Code\" = 'C000605'
GROUP BY
    c.\"Code\", c.\"Name\", a.\"Number\", a.\"Description\", a.\"SheetLength\",
    a.\"SheetWidth\", bg.\"Code\", bg.\"Weight\", o.\"OrderedQuantity\",
    o.\"OrderNumber\", o.\"PartNumber\", o.\"OrderedQuantity\",
    o.\"CreationDate\", m.\"MachineCode\", m.\"MachineType\", op.\"Status\",
    op.\"ScheduleDate\", op.\"EndRun\", op.\"ScheduleQuantity\", op.\"TotalQuantity\", 
    op.\"WasteQuantity\", op.\"M0Divisor\"
ORDER BY op.\"ScheduleDate\" DESC
LIMIT 5;
"
