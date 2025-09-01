
"use client";

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { extractData } from './actions';
import type { ExtractedData } from '@/ai/flows/extract-data-flow';
import { Download, Loader2, FileText, UploadCloud, X, ArrowDown, BarChart, FileJson, Cpu } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogFooter } from '@/components/ui/dialog';
import type { BOQItem } from '@/ai/flows/extract-data-flow';
import { format } from 'date-fns';


interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: any) => jsPDF;
}


export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [editableBoqItems, setEditableBoqItems] = useState<BOQItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const [showFinalBoq, setShowFinalBoq] = useState(false);

  const [netMargin, setNetMargin] = useState(0);
  const [freight, setFreight] = useState(0);
  const [customs, setCustoms] = useState(0);
  const [installation, setInstallation] = useState(0);
  
  const [projectName, setProjectName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [referenceNo, setReferenceNo] = useState('');


  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);

  const toolRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (extractedData?.boqs) {
      const allItems = extractedData.boqs.flatMap(boq => boq.items);
      setEditableBoqItems(allItems);
    } else {
      setEditableBoqItems([]);
    }
  }, [extractedData]);

  const handleBoqItemChange = (index: number, field: 'rate' | 'quantity', value: string) => {
    const numericValue = parseFloat(value) || 0;
    const updatedItems = [...editableBoqItems];
    const item = { ...updatedItems[index] };

    if (field === 'rate') {
        item.rate = numericValue;
    } else if (field === 'quantity') {
        item.quantity = numericValue;
    }

    item.amount = item.quantity * (item.rate ?? 0);
    updatedItems[index] = item;
    setEditableBoqItems(updatedItems);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
      setExtractedData(null);
      setShowFinalBoq(false);
    }
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      setFile(droppedFile);
      setError(null);
      setExtractedData(null);
      setShowFinalBoq(false);
    }
  };

  const handleExtract = async () => {
    if (!file) {
      setError('Please select a file first.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setExtractedData(null);
    setShowFinalBoq(false);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const dataUri = reader.result as string;
        try {
          const result = await extractData({ fileDataUri: dataUri });
          if (result && (result.boqs?.length || result.tables?.length)) {
            setExtractedData(result);
          } else {
            setError('Could not extract any data. The format may be unsupported or the document empty.');
          }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred during extraction.';
            setError(`Server error: ${errorMessage}`);
        } finally {
            setIsLoading(false);
        }
      };
      reader.onerror = () => {
        setError('Error reading file.');
        setIsLoading(false);
      }
      reader.readAsDataURL(file);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(errorMessage);
      setIsLoading(false);
    }
  };

  const originalSubtotal = editableBoqItems.reduce((acc, item) => acc + (item.amount || 0), 0);
  
  const costIncreaseFactor = (1 + netMargin / 100 + freight / 100 + customs / 100 + installation / 100);

  const finalBoqItems = editableBoqItems.map(item => {
    const newRate = (item.rate || 0) * costIncreaseFactor;
    const newAmount = item.quantity * newRate;
    return {
      ...item,
      rate: newRate,
      amount: newAmount,
    };
  });
  
  const finalSubtotal = finalBoqItems.reduce((acc, item) => acc + (item.amount || 0), 0);
  
  const vatRate = 0.05; // 5% VAT
  const vatAmount = finalSubtotal * vatRate;
  const grandTotal = finalSubtotal + vatAmount;

  const handleExportCsv = () => {
    const escapeCsvCell = (cell: any) => {
        const cellStr = String(cell ?? '').trim();
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
            return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
    };

    const headers = ['Sn', 'Item', 'Description', 'Quantity', 'Unit', 'Rate', 'Amount'];
    const rows = finalBoqItems.map((item, index) => [
        index + 1,
        item.itemCode,
        item.description,
        item.quantity,
        item.unit,
        item.rate?.toFixed(2) || '0.00',
        item.amount?.toFixed(2) || '0.00'
    ]);
    
    let csvContent = "data:text/csv;charset=utf-8,";

    // Project Details
    csvContent += `Project Name,${escapeCsvCell(projectName)}\n`;
    csvContent += `Contact Person,${escapeCsvCell(contactPerson)}\n`;
    csvContent += `Company Name,${escapeCsvCell(companyName)}\n`;
    csvContent += `Contact Number,${escapeCsvCell(contactNumber)}\n`;
    csvContent += `Date,${escapeCsvCell(date)}\n`;
    csvContent += `Reference No,${escapeCsvCell(referenceNo)}\n`;
    csvContent += '\n';

    // Table
    csvContent += headers.map(escapeCsvCell).join(',') + '\n';
    rows.forEach(row => {
        csvContent += row.map(escapeCsvCell).join(',') + '\n';
    });

    // Totals
    csvContent += '\n';
    csvContent += `,,,,,Subtotal,${finalSubtotal.toFixed(2)}\n`;
    csvContent += `,,,,,VAT (${vatRate * 100}%),${vatAmount.toFixed(2)}\n`;
    csvContent += `,,,,,Grand Total,${grandTotal.toFixed(2)}\n`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const fileName = projectName ? `${projectName.replace(/\s+/g, '_')}_BOQ.csv` : "Final_BOQ.csv";
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const handleExportPdf = async () => {
    setIsPdfGenerating(true);
    const doc = new jsPDF() as jsPDFWithAutoTable;
    const pageHeight = doc.internal.pageSize.height || doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.width || doc.internal.pageSize.getWidth();

    
    const addHeader = () => {
        // Logo
        doc.setFontSize(22);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(26, 115, 232); // A nice blue color for the logo
        doc.text('A', pageWidth / 2, 20, { align: 'center' });
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text('الشايع للمشاريع', pageWidth / 2, 26, { align: 'center' });
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'normal');
        doc.text('ALSHAYA ENTERPRISES', pageWidth / 2, 32, { align: 'center' });

        // Left side project details
        doc.setFontSize(10);
        const leftX = 14;
        let leftY = 45;
        doc.setFont(undefined, 'bold');
        doc.text('Project Name:', leftX, leftY);
        doc.setFont(undefined, 'normal');
        doc.text(projectName, leftX + 35, leftY);
        leftY += 6;
        doc.setFont(undefined, 'bold');
        doc.text('Contact Person:', leftX, leftY);
        doc.setFont(undefined, 'normal');
        doc.text(contactPerson, leftX + 35, leftY);
        leftY += 6;
        doc.setFont(undefined, 'bold');
        doc.text('Company Name:', leftX, leftY);
        doc.setFont(undefined, 'normal');
        doc.text(companyName, leftX + 35, leftY);
        leftY += 6;
        doc.setFont(undefined, 'bold');
        doc.text('Number:', leftX, leftY);
        doc.setFont(undefined, 'normal');
        doc.text(contactNumber, leftX + 35, leftY);

        // Right side date and ref
        const rightX = pageWidth - 14;
        let rightY = 45;
        doc.setFont(undefined, 'bold');
        doc.text('Date:', rightX, rightY, { align: 'right' });
        doc.setFont(undefined, 'normal');
        doc.text(date, rightX - 12, rightY, { align: 'right' });
        rightY += 6;
        doc.setFont(undefined, 'bold');
        doc.text('Reference No:', rightX, rightY, { align: 'right' });
        doc.setFont(undefined, 'normal');
        doc.text(referenceNo, rightX - 25, rightY, { align: 'right' });
    };

    const addFooter = () => {
        let footerY = pageHeight - 55;
        const leftX = 14;

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        
        doc.setFont(undefined, 'bold');
        doc.text("Regards", leftX, footerY);
        footerY += 5;
        doc.setFont(undefined, 'normal');
        doc.text("Mohamed Abdelsalam", leftX, footerY);
        footerY += 5;
        doc.text("Sr.Sales Consultant", leftX, footerY);
        footerY += 5;
        doc.text("Oman 70 Building , Al-Ghubra,", leftX, footerY);
        footerY += 5;
        doc.text("P.O Box 135 , Postal Code 103, Muscat, Oman.", leftX, footerY);
        footerY += 5;
        doc.setFont(undefined, 'bold');
        doc.text("Alshaya Enterprises®", leftX, footerY);
        footerY += 8;
        doc.setFont(undefined, 'normal');
        doc.text("Phone: (+968): (+968) 24501943 Ext. 6004", leftX, footerY);
        footerY += 5;
        doc.text("Mobile: (+968) 98901384 - 93319809", leftX, footerY);
        footerY += 5;
        
        doc.setTextColor(26, 115, 232); // Link color
        doc.textWithLink("www.alshayaenterprises.com", leftX, footerY, { url: "http://www.alshayaenterprises.com" });
        const link1Width = doc.getTextWidth("www.alshayaenterprises.com");

        footerY += 5;

        doc.textWithLink("www.facebook.com/AlshayaEnterprises/", leftX, footerY, { url: "http://www.facebook.com/AlshayaEnterprises/" });
        const link2Width = doc.getTextWidth("www.facebook.com/AlshayaEnterprises/");
        
        doc.setTextColor(0, 0, 0); // Reset color
        doc.text("|", leftX + link2Width + 2, footerY);

        doc.setTextColor(26, 115, 232); // Link color
        doc.textWithLink("www.instagram.com/alshayaenterprises/", leftX + link2Width + 5, footerY, { url: "http://www.instagram.com/alshayaenterprises/" });

        footerY += 10;
        doc.setTextColor(0, 0, 0); // Reset color

        const disclaimer = "Disclaimer: This communication doesn’t constitute any binding commitment on behalf of our company and is subject to contract and final board approval in accordance with our internal procedures.";
        doc.setFontSize(8);
        doc.setFont(undefined, 'italic');
        const splitDisclaimer = doc.splitTextToSize(disclaimer, pageWidth - 28);
        doc.text(splitDisclaimer, leftX, footerY);
    };

    // Add Table
    const tableColumn = ["Sn", "Item", "Description", "Quantity", "Unit", "Rate", "Amount"];
    
    const tableRows = finalBoqItems.map((item, index) => {
        return [
            index + 1,
            item.itemCode || '-',
            item.description,
            item.quantity,
            item.unit,
            item.rate?.toFixed(2) || '-',
            item.amount?.toFixed(2) || '-'
        ];
    });
    
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('COST SUMMARY', pageWidth / 2, 85, { align: 'center'});

    doc.autoTable({
        startY: 90,
        head: [tableColumn],
        body: tableRows,
        theme: 'grid',
        headStyles: { 
            fillColor: [55, 65, 81], // gray-700
            textColor: 255,
            fontStyle: 'bold'
        },
        styles: { 
            fontSize: 9, 
            valign: 'middle',
            cellPadding: 2,
        },
        columnStyles: {
            0: { cellWidth: 10, halign: 'center' }, // Sn
            1: { cellWidth: 20, halign: 'center' }, // Item
            2: { cellWidth: 'auto' }, // Description
            3: { cellWidth: 18, halign: 'right' }, // Quantity
            4: { cellWidth: 15, halign: 'center' }, // Unit
            5: { cellWidth: 25, halign: 'right' }, // Rate
            6: { cellWidth: 25, halign: 'right' }, // Amount
        },
        didDrawPage: (data) => {
            addHeader();
            addFooter();
        },
        willDrawCell: (data) => {
             if (data.section === 'body' && (data.column.index === 5 || data.column.index === 6)) {
                 // format rate and amount columns
                data.cell.text = Number(data.cell.text).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
             }
        },
        margin: { top: 40, bottom: 60 }, 
    });
    
    const lastAutoTable = (doc as any).lastAutoTable;
    if (lastAutoTable) {
        const rightAlign = pageWidth - 14;
        let totalsY = lastAutoTable.finalY + 8;
        
        // Check if totals would be drawn off-page and add a new page if so
        if (totalsY > pageHeight - 30) {
            doc.addPage();
            addHeader();
            addFooter();
            totalsY = 40; // Reset Y position on new page
        }

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(`Subtotal:`, rightAlign - 30, totalsY, { align: 'right' });
        doc.text(`${finalSubtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, rightAlign, totalsY, { align: 'right' });

        totalsY += 6;
        doc.text(`VAT (${vatRate * 100}%):`, rightAlign - 30, totalsY, { align: 'right' });
        doc.text(`${vatAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, rightAlign, totalsY, { align: 'right' });
        
        totalsY += 6;
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text(`Grand Total:`, rightAlign - 30, totalsY, { align: 'right' });
        doc.text(`${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, rightAlign, totalsY, { align: 'right' });
        doc.setFont(undefined, 'normal');
    }


    const pdfDataUri = doc.output('datauristring');
    setPdfPreviewUrl(pdfDataUri);
    setIsPdfGenerating(false);
  };

  const handleDownloadPdf = () => {
    if (!pdfPreviewUrl) return;
    const link = document.createElement('a');
    link.href = pdfPreviewUrl;
    const fileName = projectName ? `${projectName.replace(/\s+/g, '_')}_BOQ.pdf` : "Final_BOQ.pdf";
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const scrollToTool = () => {
    toolRef.current?.scrollIntoView({ behavior: 'smooth' });
  };


  return (
    <div className="flex flex-col items-center justify-start min-h-screen bg-background">
      {/* Hero Section */}
      <section className="w-full bg-slate-50">
        <div className="container mx-auto grid md:grid-cols-2 items-center justify-center gap-8 py-20 text-center md:text-left">
          <div className="space-y-6">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tighter">
              Automate Your Bill of Quantities with AI
            </h1>
            <p className="text-lg text-muted-foreground">
              Welcome to <span className="font-semibold text-primary">Estimation Pro</span> by Alshaya Enterprise™. Upload your document, and our AI will instantly extract the Bill of Quantities, saving you time and reducing errors.
            </p>
            <Button size="lg" onClick={scrollToTool}>
              Get Started
              <ArrowDown className="ml-2 h-5 w-5" />
            </Button>
          </div>
          <div className="hidden md:flex justify-center">
            <img 
              src="https://picsum.photos/600/400" 
              alt="Hero Illustration" 
              className="rounded-lg shadow-xl"
              data-ai-hint="construction blueprint"
            />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="w-full py-20">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold">How It Works</h2>
            <p className="text-muted-foreground mt-2">A simple, three-step process to streamline your estimations.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div className="flex flex-col items-center space-y-3">
              <div className="p-4 bg-primary/10 rounded-full">
                <UploadCloud className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">1. Upload Document</h3>
              <p className="text-muted-foreground">Drag and drop or select any document (PDF, image) containing your Bill of Quantities.</p>
            </div>
            <div className="flex flex-col items-center space-y-3">
              <div className="p-4 bg-primary/10 rounded-full">
                <Cpu className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">2. AI Extraction</h3>
              <p className="text-muted-foreground">Our intelligent agent analyzes the document and accurately extracts all line items.</p>
            </div>
            <div className="flex flex-col items-center space-y-3">
              <div className="p-4 bg-primary/10 rounded-full">
                <Download className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">3. Export & Share</h3>
              <p className="text-muted-foreground">Review, adjust margins, and export your final BOQ as a professional PDF or CSV.</p>
            </div>
          </div>
        </div>
      </section>

      <div ref={toolRef} className="w-full max-w-4xl p-4 sm:p-8">
        <Card className="w-full">
          <CardHeader className="items-center text-center">
            <h1 className="text-3xl font-bold">Alshaya Enterprise™</h1>
            <CardTitle className="text-2xl font-bold tracking-tight">
              Estimation Pro
            </CardTitle>
            <CardDescription>
              Upload a file (e.g., PDF, image) to extract tables and Bill of Quantities (BOQ).
            </CardDescription>
          </CardHeader>
          <CardContent>
          <div 
            className={`relative flex flex-col items-center justify-center w-full p-8 border-2 border-dashed rounded-lg transition-colors duration-200 ease-in-out ${isDragging ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <UploadCloud className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-center text-muted-foreground">
              <label htmlFor="file-upload" className="font-medium text-primary cursor-pointer hover:underline">
                Click to upload
              </label> or drag and drop a file
            </p>
            <p className="text-xs text-muted-foreground mt-1">PDF, PNG, JPG accepted</p>
            <Input id="file-upload" type="file" className="absolute w-full h-full opacity-0 cursor-pointer" onChange={handleFileChange} />
          </div>
            {file && !isLoading && (
              <div className="mt-4 p-4 border rounded-md flex items-center justify-between bg-muted/50">
                <div className="flex items-center gap-3">
                  <FileText className="h-6 w-6 text-primary" />
                  <span className="text-sm font-medium">{file.name}</span>
                </div>
                <Button onClick={() => setFile(null)} variant="ghost" size="sm">Remove</Button>
              </div>
            )}
             <div className="mt-4">
              <Button onClick={handleExtract} disabled={isLoading || !file} className="w-full">
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Extracting Data...
                    </>
                  ) : (
                    'Extract Data'
                  )}
                </Button>
            </div>
            {isLoading && (
                <div className="mt-4 w-full space-y-2">
                    <Progress value={undefined} />
                    <p className="text-sm text-center text-muted-foreground animate-pulse">Analyzing your document...</p>
                </div>
            )}
             {error && <p className="mt-4 text-sm text-center text-destructive">{error}</p>}
          </CardContent>
        </Card>

        {extractedData && (
          <div className="mt-8 space-y-8">
            <Card>
              <CardHeader>
                <CardTitle>Project Details</CardTitle>
                <CardDescription>
                  Enter the project and contact information for the export.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="project-name">Project Name</Label>
                  <Input id="project-name" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Enter project name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact-person">Contact Person</Label>
                  <Input id="contact-person" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder="Enter name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company-name">Company Name</Label>
                  <Input id="company-name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Enter company name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact-number">Contact Number</Label>
                  <Input id="contact-number" value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} placeholder="Enter contact number" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date">Date</Label>
                  <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reference-no">Reference No.</Label>
                  <Input id="reference-no" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="Enter reference no." />
                </div>
              </CardContent>
            </Card>

            {extractedData.tables?.map((tableData, tableIndex) => (
              <Card key={`table-${tableIndex}`}>
                <CardHeader>
                  <CardTitle>Table {tableIndex + 1}</CardTitle>
                  {tableData.description && <CardDescription>{tableData.description}</CardDescription>}
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {tableData.headers.map((header, headerIndex) => (
                          <TableHead key={`header-${tableIndex}-${headerIndex}`}>{header}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tableData.rows.map((row, rowIndex) => (
                        <TableRow key={`row-${tableIndex}-${rowIndex}`}>
                          {row.map((cell, cellIndex) => (
                            <TableCell key={`cell-${tableIndex}-${rowIndex}-${cellIndex}`}>{cell}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
            
            {editableBoqItems.length > 0 && (
              <Card>
                <CardHeader>
                   <CardTitle>Original Bill of Quantities</CardTitle>
                   <CardDescription>You can edit the quantity and rate fields below.</CardDescription>
                   {extractedData.boqs?.[0]?.description && <CardDescription>{extractedData.boqs?.[0].description}</CardDescription>}
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Sn</TableHead>
                                <TableHead>Item</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead className="text-right">Quantity</TableHead>
                                <TableHead>Unit</TableHead>
                                <TableHead className="text-right">Rate</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {editableBoqItems.map((item, itemIndex) => (
                                <TableRow key={`boq-item-${itemIndex}`}>
                                    <TableCell>{itemIndex + 1}</TableCell>
                                    <TableCell>{item.itemCode}</TableCell>
                                    <TableCell>{item.description}</TableCell>
                                    <TableCell className="text-right">
                                        <Input
                                          type="number"
                                          value={item.quantity}
                                          onChange={(e) => handleBoqItemChange(itemIndex, 'quantity', e.target.value)}
                                          className="text-right"
                                        />
                                    </TableCell>
                                    <TableCell>{item.unit}</TableCell>
                                    <TableCell className="text-right">
                                        <Input
                                            type="number"
                                            value={item.rate ?? 0}
                                            onChange={(e) => handleBoqItemChange(itemIndex, 'rate', e.target.value)}
                                            className="text-right"
                                        />
                                    </TableCell>
                                    <TableCell className="text-right">{item.amount?.toFixed(2) || '-'}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
                 <CardFooter className="flex flex-col items-end gap-2 p-6">
                    <div className="flex justify-between w-full max-w-xs font-bold text-lg border-t pt-2 mt-2">
                        <span>Subtotal</span>
                        <span>{originalSubtotal.toFixed(2)}</span>
                    </div>
                </CardFooter>
              </Card>
            )}

            {editableBoqItems.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Cost &amp; Margin Preferences</CardTitle>
                        <CardDescription>Adjust the sliders to set your preferences for additional costs and margins.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid sm:grid-cols-2 gap-6">
                         <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <Label htmlFor="net-margin">Net Margin</Label>
                                <span className="text-sm font-medium">{netMargin}%</span>
                            </div>
                            <Slider id="net-margin" value={[netMargin]} onValueChange={([v]) => setNetMargin(v)} max={100} step={1} />
                        </div>
                         <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <Label htmlFor="freight">Freight</Label>
                                <span className="text-sm font-medium">{freight}%</span>
                            </div>
                            <Slider id="freight" value={[freight]} onValueChange={([v]) => setFreight(v)} max={100} step={1} />
                        </div>
                         <div className="space-y-2">
                             <div className="flex justify-between items-center">
                                <Label htmlFor="customs">Custom Clearances</Label>
                                <span className="text-sm font-medium">{customs}%</span>
                             </div>
                            <Slider id="customs" value={[customs]} onValueChange={([v]) => setCustoms(v)} max={100} step={1} />
                        </div>
                         <div className="space-y-2">
                             <div className="flex justify-between items-center">
                                <Label htmlFor="installation">Installation</Label>
                                <span className="text-sm font-medium">{installation}%</span>
                            </div>
                            <Slider id="installation" value={[installation]} onValueChange={([v]) => setInstallation(v)} max={100} step={1} />
                        </div>
                    </CardContent>
                    <CardFooter className="justify-end">
                        <Button onClick={() => setShowFinalBoq(true)}>Generate BOQ</Button>
                    </CardFooter>
                </Card>
            )}

            {showFinalBoq && editableBoqItems.length > 0 && (
              <>
                <Card>
                  <CardHeader>
                     <CardTitle>Final Bill of Quantities</CardTitle>
                     <CardDescription>This BOQ includes the additional costs and margins you specified, distributed across each item.</CardDescription>
                  </CardHeader>
                  <CardContent>
                      <Table>
                          <TableHeader>
                              <TableRow>
                                  <TableHead>Sn</TableHead>
                                  <TableHead>Item</TableHead>
                                  <TableHead>Description</TableHead>
                                  <TableHead className="text-right">Quantity</TableHead>
                                  <TableHead>Unit</TableHead>
                                  <TableHead className="text-right">Rate</TableHead>
                                  <TableHead className="text-right">Amount</TableHead>
                              </TableRow>
                          </TableHeader>
                          <TableBody>
                              {finalBoqItems.map((item, itemIndex) => (
                                  <TableRow key={`final-boq-item-${itemIndex}`}>
                                      <TableCell>{itemIndex + 1}</TableCell>
                                      <TableCell>{item.itemCode}</TableCell>
                                      <TableCell>{item.description}</TableCell>
                                      <TableCell className="text-right">{item.quantity}</TableCell>
                                      <TableCell>{item.unit}</TableCell>
                                      <TableCell className="text-right">{item.rate?.toFixed(2) || '-'}</TableCell>
                                      <TableCell className="text-right">{item.amount?.toFixed(2) || '-'}</TableCell>
                                  </TableRow>
                              ))}
                          </TableBody>
                      </Table>
                  </CardContent>
                   <CardFooter className="flex flex-col items-end gap-2 p-6">
                      <div className="flex justify-between w-full max-w-xs">
                          <span className="text-muted-foreground">Subtotal</span>
                          <span className="font-medium">{finalSubtotal.toFixed(2)}</span>
                      </div>
                       <div className="flex justify-between w-full max-w-xs">
                          <span className="text-muted-foreground">VAT ({vatRate * 100}%)</span>
                          <span className="font-medium">{vatAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between w-full max-w-xs font-bold text-lg border-t pt-2 mt-2">
                          <span>Grand Total</span>
                          <span>{grandTotal.toFixed(2)}</span>
                      </div>
                  </CardFooter>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Export</CardTitle>
                        <CardDescription>Download the final Bill of Quantities.</CardDescription>
                    </CardHeader>
                    <CardContent className='flex gap-4'>
                        <Button onClick={handleExportCsv}>
                            <Download className="mr-2 h-4 w-4" />
                            Export as CSV
                        </Button>
                        <Button 
                            onClick={handleExportPdf} 
                            variant="outline" 
                            disabled={isPdfGenerating}
                        >
                            {isPdfGenerating ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <FileText className="mr-2 h-4 w-4" />
                                    Export as PDF
                                </>
                            )}
                        </Button>
                    </CardContent>
                </Card>
              </>
            )}
          </div>
        )}
      </div>

       <Dialog open={!!pdfPreviewUrl} onOpenChange={(isOpen) => !isOpen && setPdfPreviewUrl(null)}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>PDF Preview</DialogTitle>
             <DialogClose asChild>
                <Button variant="ghost" size="icon" className="absolute top-4 right-4">
                  <X className="h-4 w-4" />
                </Button>
            </DialogClose>
          </DialogHeader>
          <div className="flex-1 w-full h-full">
            {pdfPreviewUrl && (
              <iframe
                src={pdfPreviewUrl}
                className="w-full h-full border-0"
                title="PDF Preview"
              />
            )}
          </div>
          <DialogFooter>
             <Button variant="outline" onClick={() => setPdfPreviewUrl(null)}>Close</Button>
             <Button onClick={handleDownloadPdf}>
                <Download className="mr-2 h-4 w-4" />
                Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
