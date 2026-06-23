import React, { useEffect, useMemo, useState } from 'react';
import { Archive, ListPlus, RefreshCw } from 'lucide-react';

import { archiveFeeStructure, createFeeStructure, getFeeStructures } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const categories = [
  ['FOUNDATION', 'Foundation'],
  ['BOARD_FOUNDATION', 'Board + Foundation'],
  ['JEE_NEET', 'JEE / NEET'],
  ['AI_DATA_SCIENCE', 'AI / Data Science'],
  ['OTHER', 'Other'],
];

const initialForm = {
  name: '',
  code: '',
  category: 'OTHER',
  academicYear: '2026-27',
  classFrom: '',
  classTo: '',
  targetExam: '',
  durationMonths: '12',
  totalAmount: '',
  admissionFee: '0',
  tuitionFee: '',
  materialFee: '0',
  testSeriesFee: '0',
  technologyFee: '0',
  otherFee: '0',
  maxDiscountAmount: '0',
  maxDiscountPercent: '0',
  installments: [
    { title: 'Installment 1', amount: '', dueAfterDays: '0' },
    { title: 'Installment 2', amount: '', dueAfterDays: '60' },
    { title: 'Installment 3', amount: '', dueAfterDays: '120' },
  ],
};

function numberValue(value) {
  return Number(value || 0);
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  });
}

function slugCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export default function FeeStructuresPage() {
  const [structures, setStructures] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const totals = useMemo(() => {
    const breakup = ['admissionFee', 'tuitionFee', 'materialFee', 'testSeriesFee', 'technologyFee', 'otherFee']
      .reduce((sum, key) => sum + numberValue(form[key]), 0);
    const installments = form.installments.reduce((sum, item) => sum + numberValue(item.amount), 0);
    return { breakup, installments, total: numberValue(form.totalAmount) };
  }, [form]);

  async function loadStructures() {
    setLoading(true);
    setError('');
    try {
      const data = await getFeeStructures({ academicYear: form.academicYear, includeArchived: true });
      setStructures(data);
    } catch (err) {
      setError(err.error || err.message || 'Could not load fee structures');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStructures();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateField(key, value) {
    setForm((current) => ({
      ...current,
      [key]: value,
      code: key === 'name' && !current.code ? slugCode(value) : current.code,
      tuitionFee: key === 'totalAmount' && !current.tuitionFee ? value : current.tuitionFee,
    }));
  }

  function updateInstallment(index, key, value) {
    setForm((current) => ({
      ...current,
      installments: current.installments.map((item, itemIndex) => (
        itemIndex === index ? { ...item, [key]: value } : item
      )),
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await createFeeStructure({
        ...form,
        durationMonths: Number(form.durationMonths),
        totalAmount: numberValue(form.totalAmount),
        admissionFee: numberValue(form.admissionFee),
        tuitionFee: numberValue(form.tuitionFee),
        materialFee: numberValue(form.materialFee),
        testSeriesFee: numberValue(form.testSeriesFee),
        technologyFee: numberValue(form.technologyFee),
        otherFee: numberValue(form.otherFee),
        maxDiscountAmount: numberValue(form.maxDiscountAmount),
        maxDiscountPercent: numberValue(form.maxDiscountPercent),
        installments: form.installments.map((item) => ({
          ...item,
          amount: numberValue(item.amount),
          dueAfterDays: Number(item.dueAfterDays || 0),
        })),
      });
      setMessage(`${result.data.name} created`);
      setForm(initialForm);
      await loadStructures();
    } catch (err) {
      setError(err.error || err.message || 'Could not create fee structure');
    } finally {
      setSaving(false);
    }
  }

  async function archive(id) {
    setError('');
    setMessage('');
    try {
      await archiveFeeStructure(id);
      setMessage('Fee structure archived');
      await loadStructures();
    } catch (err) {
      setError(err.error || err.message || 'Could not archive fee structure');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal">Fee Structures</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tenant fee templates with installment schedules. Archived templates stay visible for historical records.
          </p>
        </div>
        <Button variant="outline" onClick={loadStructures} disabled={loading} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ListPlus className="h-5 w-5" />
            Add Fee Structure
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="md:col-span-2">
                <Label htmlFor="fee-name">Name</Label>
                <Input id="fee-name" required value={form.name} onChange={(event) => updateField('name', event.target.value)} />
              </div>
              <div>
                <Label htmlFor="fee-code">Code</Label>
                <Input id="fee-code" required value={form.code} onChange={(event) => updateField('code', slugCode(event.target.value))} />
              </div>
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(value) => updateField('category', value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categories.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="academic-year">Academic year</Label>
                <Input id="academic-year" required value={form.academicYear} onChange={(event) => updateField('academicYear', event.target.value)} />
              </div>
              <div>
                <Label>Duration</Label>
                <Select value={form.durationMonths} onValueChange={(value) => updateField('durationMonths', value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['1', '3', '6', '12', '24'].map((value) => <SelectItem key={value} value={value}>{value} months</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="total">Total amount</Label>
                <Input id="total" required type="number" min="1" value={form.totalAmount} onChange={(event) => updateField('totalAmount', event.target.value)} />
              </div>
              <div>
                <Label htmlFor="target">Target exam</Label>
                <Input id="target" value={form.targetExam} onChange={(event) => updateField('targetExam', event.target.value)} />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-6">
              {[
                ['admissionFee', 'Admission'],
                ['tuitionFee', 'Tuition'],
                ['materialFee', 'Material'],
                ['testSeriesFee', 'Tests'],
                ['technologyFee', 'Technology'],
                ['otherFee', 'Other'],
              ].map(([key, label]) => (
                <div key={key}>
                  <Label htmlFor={key}>{label}</Label>
                  <Input id={key} type="number" min="0" value={form[key]} onChange={(event) => updateField(key, event.target.value)} />
                </div>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {form.installments.map((item, index) => (
                <div key={index} className="grid gap-2 rounded-md border bg-muted/30 p-3">
                  <Input value={item.title} onChange={(event) => updateInstallment(index, 'title', event.target.value)} />
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="number" min="1" placeholder="Amount" value={item.amount} onChange={(event) => updateInstallment(index, 'amount', event.target.value)} />
                    <Input type="number" min="0" placeholder="Due days" value={item.dueAfterDays} onChange={(event) => updateInstallment(index, 'dueAfterDays', event.target.value)} />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-3 text-sm md:flex-row md:items-center md:justify-between">
              <div className="text-muted-foreground">
                Breakup: {formatCurrency(totals.breakup)} - Installments: {formatCurrency(totals.installments)} - Total: {formatCurrency(totals.total)}
              </div>
              <Button type="submit" disabled={saving} className="gap-2">
                <ListPlus className="h-4 w-4" />
                {saving ? 'Creating...' : 'Create structure'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Structures</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Installments</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {structures.map((structure) => (
                  <TableRow key={structure.id}>
                    <TableCell>
                      <div className="font-medium">{structure.name}</div>
                      <div className="text-xs text-muted-foreground">{structure.code} - {structure.academicYear}</div>
                    </TableCell>
                    <TableCell>{categories.find(([value]) => value === structure.category)?.[1] || structure.category}</TableCell>
                    <TableCell>{formatCurrency(structure.totalAmount)}</TableCell>
                    <TableCell>
                      <div className="space-y-1 text-xs">
                        {(structure.installments || []).map((item) => (
                          <div key={item.id || item.installmentNumber}>
                            {item.title}: {formatCurrency(item.amount)} due +{item.dueAfterDays} days
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={structure.isActive ? 'default' : 'secondary'}>
                        {structure.isActive ? 'Active' : 'Archived'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {structure.isActive ? (
                        <Button variant="outline" size="sm" onClick={() => archive(structure.id)} className="gap-2">
                          <Archive className="h-4 w-4" />
                          Archive
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Historical</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!structures.length && !loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No fee structures found.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
