import React, { useState } from 'react';
import { Plus, Check, Trash2, Edit2, X, EyeOff } from 'lucide-react';
import { FixedExpense } from '../types';

interface ExpensesViewProps {
  expenses: FixedExpense[];
  onAddExpense: (exp: FixedExpense) => void;
  onUpdateExpense: (exp: FixedExpense) => void;
  onTogglePaid: (id: string) => void;
  onDeleteExpense: (id: string) => void;
  onClearAllExpenses: () => void;
  showExpenses: boolean;
  onToggleShowExpenses: () => void;
}

export const ExpensesView: React.FC<ExpensesViewProps> = ({
  expenses,
  onAddExpense,
  onUpdateExpense,
  onTogglePaid,
  onDeleteExpense,
  onClearAllExpenses,
  showExpenses,
  onToggleShowExpenses
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<FixedExpense | null>(null);

  // Form states per Aggiunta
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<FixedExpense['category']>('Casa');
  const [frequency, setFrequency] = useState<FixedExpense['frequency']>('Mensile');
  const [dueDay, setDueDay] = useState('1');
  const [notes, setNotes] = useState('');

  // Form states per Modifica
  const [editName, setEditName] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editCategory, setEditCategory] = useState<FixedExpense['category']>('Casa');
  const [editFrequency, setEditFrequency] = useState<FixedExpense['frequency']>('Mensile');
  const [editDueDay, setEditDueDay] = useState('1');
  const [editNotes, setEditNotes] = useState('');

  const totalMonthly = expenses.reduce((sum, e) => {
    const factor = e.frequency === 'Annuale' ? 1 / 12 : e.frequency === 'Bimestrale' ? 1 / 2 : 1;
    return sum + (e.amount * factor);
  }, 0);

  const totalPaid = expenses
    .filter(e => e.isPaid)
    .reduce((sum, e) => sum + e.amount, 0);

  const totalToPay = expenses
    .filter(e => !e.isPaid)
    .reduce((sum, e) => sum + e.amount, 0);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !amount) return;

    const newExpense: FixedExpense = {
      id: `exp-${Date.now()}`,
      name: name.trim(),
      amount: parseFloat(amount),
      category,
      frequency,
      dueDay: parseInt(dueDay) || 1,
      isPaid: false,
      notes: notes.trim()
    };

    onAddExpense(newExpense);
    setName('');
    setAmount('');
    setNotes('');
    setShowAddForm(false);
  };

  const handleStartEdit = (exp: FixedExpense) => {
    setEditingExpense(exp);
    setEditName(exp.name);
    setEditAmount(String(exp.amount));
    setEditCategory(exp.category);
    setEditFrequency(exp.frequency);
    setEditDueDay(String(exp.dueDay));
    setEditNotes(exp.notes || '');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense || !editName.trim() || !editAmount) return;

    const updated: FixedExpense = {
      ...editingExpense,
      name: editName.trim(),
      amount: parseFloat(editAmount),
      category: editCategory,
      frequency: editFrequency,
      dueDay: parseInt(editDueDay) || 1,
      notes: editNotes.trim()
    };

    onUpdateExpense(updated);
    setEditingExpense(null);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Spese Fisse & Ricorrenti</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Traccia uscite fisse mensili, scadenze bollette e abbonamenti personali (completamente modificabili).
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {expenses.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm("Sei sicuro di voler eliminare tutte le spese registrate?")) {
                  onClearAllExpenses();
                }
              }}
              className="px-3 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-medium transition-colors"
              title="Svuota tutte le spese"
            >
              Svuota Spese
            </button>
          )}

          <button
            onClick={onToggleShowExpenses}
            className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors flex items-center space-x-1.5 ${
              !showExpenses
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <EyeOff className="w-3.5 h-3.5" />
            <span>{showExpenses ? 'Nascondi da Dashboard' : 'Modulo Nascosto'}</span>
          </button>

          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center justify-center space-x-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{showAddForm ? 'Chiudi Form' : 'Aggiungi Spesa'}</span>
          </button>
        </div>
      </div>

      {!showExpenses && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center justify-between">
          <span>Il modulo Spese Fisse è attualmente <b>nascosto dalla panoramica principale</b>. Clicca su "Mostra in Dashboard" per riattivarlo quando vuoi.</span>
          <button
            onClick={onToggleShowExpenses}
            className="font-semibold underline ml-2"
          >
            Mostra di nuovo
          </button>
        </div>
      )}

      {/* Flat Pastel Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-xs">
          <div className="text-xs text-slate-500 font-medium">Totale Mensile Stimato</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">€ {totalMonthly.toFixed(2)}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">{expenses.length} spese registrate</div>
        </div>

        <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-100 shadow-xs">
          <div className="text-xs text-emerald-800 font-medium">Già Saldato questo Mese</div>
          <div className="text-2xl font-bold text-emerald-800 mt-1">€ {totalPaid.toFixed(2)}</div>
          <div className="text-[11px] text-emerald-700 mt-0.5">
            {expenses.filter(e => e.isPaid).length} pagate
          </div>
        </div>

        <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-100 shadow-xs">
          <div className="text-xs text-amber-800 font-medium">Da Saldare</div>
          <div className="text-2xl font-bold text-amber-800 mt-1">€ {totalToPay.toFixed(2)}</div>
          <div className="text-[11px] text-amber-700 mt-0.5">
            {expenses.filter(e => !e.isPaid).length} rimanenti
          </div>
        </div>
      </div>

      {/* Edit Modal / Box */}
      {editingExpense && (
        <form onSubmit={handleSaveEdit} className="p-4 rounded-xl bg-sky-50/80 border border-sky-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-sky-900 uppercase tracking-wider">Modifica Spesa: {editingExpense.name}</div>
            <button
              type="button"
              onClick={() => setEditingExpense(null)}
              className="p-1 text-slate-500 hover:text-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-slate-700 mb-1">Nome Spesa</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-sky-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-slate-700 mb-1">Importo (€)</label>
              <input
                type="number"
                step="0.01"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-sky-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-slate-700 mb-1">Categoria</label>
              <select
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value as any)}
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-sky-500"
              >
                <option value="Casa">Casa</option>
                <option value="Utenze">Utenze</option>
                <option value="Abbonamenti">Abbonamenti</option>
                <option value="Trasporti">Trasporti</option>
                <option value="Lavoro">Lavoro</option>
                <option value="Altro">Altro</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-700 mb-1">Giorno Scadenza (1-31)</label>
              <input
                type="number"
                min="1"
                max="31"
                value={editDueDay}
                onChange={(e) => setEditDueDay(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-700 mb-1">Frequenza</label>
              <select
                value={editFrequency}
                onChange={(e) => setEditFrequency(e.target.value as any)}
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-sky-500"
              >
                <option value="Mensile">Mensile</option>
                <option value="Bimestrale">Bimestrale</option>
                <option value="Annuale">Annuale</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-700 mb-1">Note</label>
              <input
                type="text"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-1">
            <button
              type="button"
              onClick={() => setEditingExpense(null)}
              className="px-3 py-1.5 rounded-lg text-xs text-slate-600 hover:text-slate-900"
            >
              Annulla
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold"
            >
              Salva Modifiche
            </button>
          </div>
        </form>
      )}

      {/* Add Form */}
      {showAddForm && (
        <form onSubmit={handleCreateSubmit} className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-xs space-y-4">
          <div className="text-xs font-semibold text-slate-800 uppercase tracking-wider">Nuova Spesa Fissa</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-slate-600 mb-1">Nome Spesa</label>
              <input
                type="text"
                placeholder="es. Affitto casa"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:bg-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-slate-600 mb-1">Importo (€)</label>
              <input
                type="number"
                step="0.01"
                placeholder="es. 850"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:bg-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-slate-600 mb-1">Categoria</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-sky-500 focus:bg-white"
              >
                <option value="Casa">Casa</option>
                <option value="Utenze">Utenze</option>
                <option value="Abbonamenti">Abbonamenti</option>
                <option value="Trasporti">Trasporti</option>
                <option value="Lavoro">Lavoro</option>
                <option value="Altro">Altro</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-600 mb-1">Giorno Scadenza (del mese)</label>
              <input
                type="number"
                min="1"
                max="31"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-sky-500 focus:bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-600 mb-1">Frequenza</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as any)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-sky-500 focus:bg-white"
              >
                <option value="Mensile">Mensile</option>
                <option value="Bimestrale">Bimestrale</option>
                <option value="Annuale">Annuale</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">Note (facoltative)</label>
              <input
                type="text"
                placeholder="es. Addebito su conto secondario"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:bg-white"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-800"
            >
              Annulla
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
            >
              Salva Spesa
            </button>
          </div>
        </form>
      )}

      {/* Expenses Flat List */}
      <div className="rounded-xl bg-white border border-slate-200/90 shadow-xs divide-y divide-slate-100 overflow-hidden">
        {expenses.map((exp) => (
          <div
            key={exp.id}
            className="p-3.5 sm:p-4 flex items-center justify-between hover:bg-slate-50/60 transition-colors"
          >
            <div className="flex items-center space-x-3">
              <button
                onClick={() => onTogglePaid(exp.id)}
                className={`w-6 h-6 rounded-lg flex items-center justify-center border transition-all ${
                  exp.isPaid
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : 'border-slate-300 hover:border-slate-400 text-transparent'
                }`}
                title={exp.isPaid ? 'Segna come non pagato' : 'Segna come pagato'}
              >
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </button>

              <div>
                <div className="flex items-center space-x-2">
                  <span className={`text-sm font-semibold ${exp.isPaid ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                    {exp.name}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-medium">
                    {exp.category}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 flex items-center space-x-2">
                  <span>Scadenza: ogni giorno {exp.dueDay} ({exp.frequency})</span>
                  {exp.notes && <span>• {exp.notes}</span>}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className="text-right">
                <div className="text-sm font-bold text-slate-900">€ {exp.amount.toFixed(2)}</div>
                <span className={`text-[10px] font-medium ${exp.isPaid ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {exp.isPaid ? 'Saldato' : 'In attesa'}
                </span>
              </div>

              {/* Edit button */}
              <button
                onClick={() => handleStartEdit(exp)}
                className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded transition-colors"
                title="Modifica Spesa"
              >
                <Edit2 className="w-4 h-4" />
              </button>

              {/* Delete button */}
              <button
                onClick={() => onDeleteExpense(exp.id)}
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                title="Elimina"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}

        {expenses.length === 0 && (
          <div className="p-8 text-center text-slate-400 text-xs">
            Nessuna spesa registrata. Clicca su "+ Aggiungi Spesa" se desideri tracciarne qualcuna.
          </div>
        )}
      </div>

    </div>
  );
};
