import React, { useEffect, useState } from 'react';
import {
  fetchOntologyEntities,
  fetchEntityAttributes,
  createOntologyEntity,
  createEntityAttribute,
  updateEntityAttribute,
  deleteEntityAttribute,
  fetchOntologyRelations,
  createOntologyRelation,
  updateOntologyRelation,
  deleteOntologyRelation,
  fetchOntologyClassifications,
  createOntologyClassification,
  updateOntologyClassification,
  deleteOntologyClassification,
  createUser,
  fetchUsers,
  updateUserRole,
} from '../api';

export default function OntologyAdmin() {
  const [entities, setEntities] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newEntityName, setNewEntityName] = useState('');
  const [newAttrName, setNewAttrName] = useState('');
  const [relations, setRelations] = useState([]);
  const [classes, setClasses] = useState([]);
  const [newRelation, setNewRelation] = useState({ from_entity_id: '', to_entity_id: '', name: '', cardinality: '1..*' });
  const [newClassName, setNewClassName] = useState('');
  const [editingAttrId, setEditingAttrId] = useState(null);
  const [editingAttr, setEditingAttr] = useState({});
  const [editingRelationId, setEditingRelationId] = useState(null);
  const [editingRelation, setEditingRelation] = useState({});
  const [editingClassId, setEditingClassId] = useState(null);
  const [editingClassName, setEditingClassName] = useState('');
  const [users, setUsers] = useState([]);
  const [userMessage, setUserMessage] = useState('');
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user' });
  const [notice, setNotice] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);

  async function loadEntities() {
    setLoading(true);
    try {
      const res = await fetchOntologyEntities();
      setEntities(res);
    } catch (e) {
      console.error(e);
      setNotice(e.error || 'Could not load entities');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEntities();
    loadRelations();
    loadClasses();
    loadUsers();
  }, []);

  useEffect(() => {
    // Refresh relation and classification lookup when entity names change.
    loadRelations();
    loadClasses();
  }, [entities]);

  async function handleSelect(entity) {
    setSelected(null);
    try {
      const res = await fetchEntityAttributes(entity.id);
      setSelected({ ...entity, attributes: res });
    } catch (e) {
      setNotice(e.error || 'Could not load attributes');
    }
  }

  async function loadRelations() {
    try {
      const res = await fetchOntologyRelations();
      setRelations(res);
    } catch (e) {
      console.error(e);
    }
  }

  async function loadClasses() {
    try {
      const res = await fetchOntologyClassifications();
      setClasses(res);
    } catch (e) {
      console.error(e);
    }
  }

  async function loadUsers() {
    try {
      const res = await fetchUsers();
      setUsers(res);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleRoleChange(userId, role) {
    try {
      await updateUserRole(userId, role);
      setUserMessage('User role updated.');
      await loadUsers();
    } catch (e) {
      setUserMessage(e.error || 'Role update failed');
    }
  }

  async function handleCreateUser(e) {
    e.preventDefault();
    try {
      await createUser(newUser);
      setNewUser({ username: '', password: '', role: 'user' });
      setUserMessage('User created.');
      await loadUsers();
    } catch (e) {
      setUserMessage(e.error || 'User creation failed');
    }
  }

  function getEntityLabel(id) {
    const entity = entities.find((e) => String(e.id) === String(id));
    return entity ? (entity.displayName || entity.name) : `Entity ${id}`;
  }

  async function handleCreateEntity(e) {
    e.preventDefault();
    try {
      await createOntologyEntity({ name: newEntityName, displayName: newEntityName });
      setNewEntityName('');
      setNotice('Entity created.');
      await loadEntities();
    } catch (e) {
      setNotice(e.error || 'Create failed');
    }
  }

  async function handleCreateAttr(e) {
    e.preventDefault();
    if (!selected) return;
    try {
      await createEntityAttribute(selected.id, { name: newAttrName, label: newAttrName, type: 'string' });
      setNewAttrName('');
      setNotice('Attribute created.');
      await handleSelect(selected);
    } catch (e) {
      setNotice(e.error || 'Create attribute failed');
    }
  }

  async function handleDeleteAttr(id) {
    setPendingDelete({ type: 'attribute', id });
  }

  async function confirmPendingDelete() {
    if (!pendingDelete) return;
    try {
      if (pendingDelete.type === 'attribute') {
        await deleteEntityAttribute(pendingDelete.id);
        if (selected) await handleSelect(selected);
      }
      if (pendingDelete.type === 'relation') {
        await deleteOntologyRelation(pendingDelete.id);
        await loadRelations();
      }
      if (pendingDelete.type === 'classification') {
        await deleteOntologyClassification(pendingDelete.id);
        await loadClasses();
      }
      setNotice('Deleted.');
      setPendingDelete(null);
      if (selected) await handleSelect(selected);
    } catch (e) {
      setNotice(e.error || 'Delete failed');
    }
  }

  function startEditAttr(attr) {
    setEditingAttrId(attr.id);
    setEditingAttr({ label: attr.label, type: attr.type, required: !!attr.required });
  }

  async function saveEditAttr(id) {
    try {
      await updateEntityAttribute(id, { label: editingAttr.label, type: editingAttr.type, required: editingAttr.required });
      setEditingAttrId(null);
      setEditingAttr({});
      setNotice('Attribute saved.');
      if (selected) await handleSelect(selected);
    } catch (e) {
      setNotice(e.error || 'Save failed');
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold">Ontology Admin</h2>
        <p className="mt-1 text-sm text-slate-600">Manage entity definitions and attributes used to drive dynamic forms and schemas.</p>
      </div>

      {notice ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 shadow-sm">
          {notice}
        </div>
      ) : null}

      {pendingDelete ? (
        <div className="rounded-2xl border border-rose-200 bg-white p-5 shadow-sm">
          <p className="font-semibold text-slate-950">Delete this {pendingDelete.type}?</p>
          <p className="mt-1 text-sm text-slate-600">This action cannot be undone.</p>
          <div className="mt-4 flex gap-2">
            <button onClick={confirmPendingDelete} className="rounded-md bg-rose-500 px-3 py-1 text-sm text-white">Delete</button>
            <button onClick={() => setPendingDelete(null)} className="rounded-md border px-3 py-1 text-sm">Cancel</button>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold">User Roles</h3>
            <p className="mt-1 text-sm text-slate-600">Promote or demote users between standard access and admin access.</p>
          </div>
          {userMessage ? <span className="text-sm text-slate-500">{userMessage}</span> : null}
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {users.map((user) => (
            <div key={user.id} className="flex items-center justify-between rounded-md border border-slate-200 p-3">
              <div>
                <p className="font-medium">{user.username}</p>
                <p className="text-sm text-slate-500">Current role: {user.role}</p>
              </div>
              <select value={user.role} onChange={(e) => handleRoleChange(user.id, e.target.value)} className="rounded-md border px-2 py-1 text-sm">
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </div>
          ))}
        </div>
        <form onSubmit={handleCreateUser} className="mt-4 grid gap-2 md:grid-cols-[1fr_1fr_140px_auto]">
          <input
            value={newUser.username}
            onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
            placeholder="Username"
            className="rounded-md border px-3 py-2 text-sm"
          />
          <input
            type="password"
            value={newUser.password}
            onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
            placeholder="Temporary password"
            className="rounded-md border px-3 py-2 text-sm"
          />
          <select
            value={newUser.role}
            onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
            className="rounded-md border px-3 py-2 text-sm"
          >
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
          <button className="rounded-md bg-emerald-600 px-3 py-2 text-sm text-white">Create user</button>
        </form>
      </div>

        <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold">Entities</h3>
          {loading ? <div>Loading…</div> : entities.map((e) => (
            <div key={e.id} className="mt-3 flex items-center justify-between">
              <div>
                <div className="font-medium">{e.displayName || e.name}</div>
                <div className="text-sm text-slate-500">{e.description}</div>
              </div>
              <div>
                <button onClick={()=>handleSelect(e)} className="rounded-md border px-3 py-1 text-sm">Open</button>
              </div>
            </div>
          ))}

          <form onSubmit={handleCreateEntity} className="mt-4 flex gap-2">
            <input value={newEntityName} onChange={(e)=>setNewEntityName(e.target.value)} placeholder="new entity" className="rounded-md border px-3 py-2" />
            <button className="rounded-md bg-emerald-600 px-3 py-2 text-white">Add</button>
          </form>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-2">
          <h3 className="font-semibold">Entity Details</h3>
          {!selected ? <div className="mt-3 text-sm text-slate-500">Select an entity to view attributes.</div> : (
            <div className="mt-3">
              <div className="font-medium">{selected.displayName || selected.name}</div>
              <div className="mt-2">
                <h4 className="text-sm font-semibold">Attributes</h4>
                {selected.attributes?.length ? selected.attributes.map((a)=> (
                  <div key={a.id} className="mt-2 text-sm border rounded-md p-2 flex items-start justify-between">
                    <div>
                      {editingAttrId === a.id ? (
                        <div className="space-y-2">
                          <input className="rounded-md border px-2 py-1" value={editingAttr.label} onChange={(e)=>setEditingAttr({...editingAttr, label: e.target.value})} />
                          <div className="flex items-center gap-2">
                            <select value={editingAttr.type} onChange={(e)=>setEditingAttr({...editingAttr, type: e.target.value})} className="rounded-md border px-2 py-1">
                              <option value="string">string</option>
                              <option value="number">number</option>
                              <option value="json">json</option>
                              <option value="datetime">datetime</option>
                            </select>
                            <label className="text-sm"><input type="checkbox" checked={editingAttr.required} onChange={(e)=>setEditingAttr({...editingAttr, required: e.target.checked})} /> Required</label>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="font-medium">{a.label}</div>
                          <div className="text-sm text-slate-500">{a.type} {a.required ? '• required' : ''}</div>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {editingAttrId === a.id ? (
                        <>
                          <button onClick={()=>saveEditAttr(a.id)} className="rounded-md bg-emerald-600 px-3 py-1 text-white text-sm">Save</button>
                          <button onClick={()=>{setEditingAttrId(null); setEditingAttr({})}} className="rounded-md border px-3 py-1 text-sm">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={()=>startEditAttr(a)} className="rounded-md border px-3 py-1 text-sm">Edit</button>
                          <button onClick={()=>handleDeleteAttr(a.id)} className="rounded-md bg-rose-500 px-3 py-1 text-white text-sm">Delete</button>
                        </>
                      )}
                    </div>
                  </div>
                )) : <div className="mt-2 text-sm text-slate-500">No attributes yet</div>}

                <form onSubmit={handleCreateAttr} className="mt-4 flex gap-2">
                  <input value={newAttrName} onChange={(e)=>setNewAttrName(e.target.value)} placeholder="new attribute" className="rounded-md border px-3 py-2" />
                  <button className="rounded-md bg-emerald-600 px-3 py-2 text-white">Add Attribute</button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold">Relations</h3>
          <div className="mt-3 space-y-2">
            {relations.map((r) => (
              <div key={r.id} className="flex items-center justify-between border rounded-md p-2">
                <div>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-sm text-slate-500">{r.cardinality} — {getEntityLabel(r.from_entity_id)} → {getEntityLabel(r.to_entity_id)}</div>
                </div>
                <div className="flex gap-2">
                  {editingRelationId === r.id ? (
                    <>
                      <button onClick={async ()=>{await updateOntologyRelation(r.id, editingRelation); setEditingRelationId(null); setEditingRelation({}); await loadRelations();}} className="rounded-md bg-emerald-600 px-3 py-1 text-white text-sm">Save</button>
                      <button onClick={()=>{setEditingRelationId(null); setEditingRelation({})}} className="rounded-md border px-3 py-1 text-sm">Cancel</button>
                    </>
                  ) : (
                    <>
                      <button onClick={()=>{setEditingRelationId(r.id); setEditingRelation({ name: r.name, cardinality: r.cardinality })}} className="rounded-md border px-3 py-1 text-sm">Edit</button>
                      <button onClick={()=>setPendingDelete({ type: 'relation', id: r.id })} className="rounded-md bg-rose-500 px-3 py-1 text-white text-sm">Delete</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={async (e)=>{ e.preventDefault(); try{ await createOntologyRelation(newRelation); setNewRelation({ from_entity_id: '', to_entity_id: '', name: '', cardinality: '1..*' }); setNotice('Relation created.'); await loadRelations(); }catch(e){setNotice(e.error||'Create failed')}}} className="mt-4 grid gap-2">
            <select value={newRelation.from_entity_id} onChange={(e)=>setNewRelation({...newRelation, from_entity_id: e.target.value})} className="rounded-md border px-3 py-2">
              <option value="">From entity</option>
              {entities.map(en=> <option key={en.id} value={en.id}>{en.displayName||en.name}</option>)}
            </select>
            <select value={newRelation.to_entity_id} onChange={(e)=>setNewRelation({...newRelation, to_entity_id: e.target.value})} className="rounded-md border px-3 py-2">
              <option value="">To entity</option>
              {entities.map(en=> <option key={en.id} value={en.id}>{en.displayName||en.name}</option>)}
            </select>
            <input value={newRelation.name} onChange={(e)=>setNewRelation({...newRelation, name: e.target.value})} placeholder="relation name" className="rounded-md border px-3 py-2" />
            <input value={newRelation.cardinality} onChange={(e)=>setNewRelation({...newRelation, cardinality: e.target.value})} placeholder="cardinality" className="rounded-md border px-3 py-2" />
            <button className="rounded-md bg-emerald-600 px-3 py-2 text-white">Add Relation</button>
          </form>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold">Classifications</h3>
          <div className="mt-3 space-y-2">
            {classes.map((c)=> (
              <div key={c.id} className="flex items-center justify-between border rounded-md p-2">
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-sm text-slate-500">{c.description}</div>
                </div>
                <div className="flex gap-2">
                  {editingClassId === c.id ? (
                    <>
                      <button onClick={async ()=>{ await updateOntologyClassification(c.id, { name: editingClassName }); setEditingClassId(null); setEditingClassName(''); await loadClasses(); }} className="rounded-md bg-emerald-600 px-3 py-1 text-white text-sm">Save</button>
                      <button onClick={()=>{setEditingClassId(null); setEditingClassName('')}} className="rounded-md border px-3 py-1 text-sm">Cancel</button>
                    </>
                  ) : (
                    <>
                      <button onClick={()=>{ setEditingClassId(c.id); setEditingClassName(c.name); }} className="rounded-md border px-3 py-1 text-sm">Edit</button>
                      <button onClick={()=>setPendingDelete({ type: 'classification', id: c.id })} className="rounded-md bg-rose-500 px-3 py-1 text-white text-sm">Delete</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={async (e)=>{ e.preventDefault(); try{ await createOntologyClassification({ name: newClassName }); setNewClassName(''); setNotice('Classification created.'); await loadClasses(); }catch(e){setNotice(e.error||'Create failed')}}} className="mt-4 flex gap-2">
            <input value={newClassName} onChange={(e)=>setNewClassName(e.target.value)} placeholder="new classification" className="rounded-md border px-3 py-2" />
            <button className="rounded-md bg-emerald-600 px-3 py-2 text-white">Add</button>
          </form>
        </div>
      </div>
    </div>
  );
}

// load relations and classifications when entities change
export function _onEntityListChangeHook(loadRelations, loadClasses) {
  // noop placeholder for tests
}
