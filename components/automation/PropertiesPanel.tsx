import React, { useEffect, useState } from 'react';
import { Node } from '@xyflow/react';
import useSWR from 'swr';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from '@/components/ui/badge';
import { X, Save, Plus, Trash2, UploadCloud, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface PropertiesPanelProps {
  selectedNode: Node | null;
  onUpdateNode: (id: string, data: any) => void;
  onClose: () => void;
}

export function PropertiesPanel({ selectedNode, onUpdateNode, onClose }: PropertiesPanelProps) {
  const t = useTranslations('Automation');
  const [label, setLabel] = useState('');
  const [options, setOptions] = useState<string[]>([]);
  const [seconds, setSeconds] = useState<number>(2);
  
  const [variable, setVariable] = useState('');

  const [saveNameVar, setSaveNameVar] = useState('');
  const [saveAgentId, setSaveAgentId] = useState('null');
  const [saveDepartmentId, setSaveDepartmentId] = useState('null');
  const [saveTagId, setSaveTagId] = useState('null');
  const [saveFunnelId, setSaveFunnelId] = useState('null');
  const [saveCustomFields, setSaveCustomFields] = useState<Record<string, string>>({});

  const [triggerType, setTriggerType] = useState('contains');
  const [keywordInput, setKeywordInput] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [conditionStage, setConditionStage] = useState<string>('null');
  const [conditionTag, setConditionTag] = useState<string>('null');
  const [conditionAgent, setConditionAgent] = useState<string>('null');
  const [conditionDepartment, setConditionDepartment] = useState<string>('null');

  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState('image');
  const [mediaCaption, setMediaCaption] = useState('');
  const [fileName, setFileName] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const [title, setTitle] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [footerText, setFooterText] = useState('');
  const [buttonText, setButtonText] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [buttons, setButtons] = useState<{ id: string; text: string; value: string }[]>([]);
  const [listItems, setListItems] = useState<{ id: string; title: string; description: string; rowId: string }[]>([]);

  const [aiAction, setAiAction] = useState('active');

  const [conditions, setConditions] = useState<{ id: string; type: string; operator: string; value: string; value2?: string }[]>([]);

  const shouldFetchCRM = selectedNode?.type === 'start' || selectedNode?.type === 'save_contact';
  const { data: funnelStages } = useSWR<any[]>(shouldFetchCRM ? '/api/funnel-stages' : null, fetcher);
  const { data: tags } = useSWR<any[]>(shouldFetchCRM ? '/api/tags' : null, fetcher);
  const { data: teamData } = useSWR<any>(shouldFetchCRM ? '/api/team' : null, fetcher);
  const { data: customFields } = useSWR<any[]>(shouldFetchCRM ? '/api/custom-fields' : null, fetcher);
  const { data: departmentsList } = useSWR<any[]>(shouldFetchCRM ? '/api/departments' : null, fetcher);
  
  const agents = teamData?.teamMembers?.map((tm: any) => tm.user) || [];

  useEffect(() => {
    if (selectedNode) {
      setLabel(selectedNode.data.label as string || '');
      setTitle(selectedNode.data.title as string || '');
      setBodyText(selectedNode.data.bodyText as string || '');
      setFooterText(selectedNode.data.footerText as string || '');
      setButtonText(selectedNode.data.buttonText as string || '');
      
      if (selectedNode.type === 'options') setOptions(selectedNode.data.options as string[] || []);
      if (selectedNode.type === 'delay') setSeconds(Number(selectedNode.data.seconds) || 2);
      
      if (selectedNode.type === 'collect') {
        setVariable(selectedNode.data.variable as string || '');
      }

      if (selectedNode.type === 'save_contact') {
        setSaveNameVar(selectedNode.data.nameVariable as string || '');
        setSaveAgentId(selectedNode.data.agentId as string || 'null');
        setSaveDepartmentId(selectedNode.data.departmentId as string || 'null');
        setSaveTagId(selectedNode.data.tagId as string || 'null');
        setSaveFunnelId(selectedNode.data.funnelStageId as string || 'null');
        setSaveCustomFields(selectedNode.data.customFields as Record<string, string> || {});
      }

      if (selectedNode.type === 'start') {
        setTriggerType(selectedNode.data.triggerType as string || 'contains');
        setKeywords(selectedNode.data.keywords as string[] || []);
        const conditions = selectedNode.data.conditions as any || {};
        setConditionStage(conditions.funnelStageId || 'null');
        setConditionTag(conditions.tagId || 'null');
        setConditionAgent(conditions.assignedUserId || 'null');
        setConditionDepartment(conditions.departmentId || 'null');
      }

      if (selectedNode.type === 'media') {
        setMediaUrl(selectedNode.data.mediaUrl as string || '');
        setMediaType(selectedNode.data.mediaType as string || 'image');
        setMediaCaption(selectedNode.data.caption as string || '');
        setFileName(selectedNode.data.fileName as string || '');
      }

      if (selectedNode.type === 'button_message') {
        setButtons(selectedNode.data.buttons as any[] || []);
      }

      if (selectedNode.type === 'list_message') {
        setListItems(selectedNode.data.items as any[] || []);
      }

      if (selectedNode.type === 'call_to_action') {
        setCtaUrl(selectedNode.data.url as string || '');
      }

      if (selectedNode.type === 'ai_control') {
        setAiAction(selectedNode.data.action as string || 'active');
      }

      if (selectedNode.type === 'condition') {
        setConditions(selectedNode.data.conditions as any[] || []);
      }
    }
  }, [selectedNode]);

  if (!selectedNode) {
    return (
      <aside className="w-80 bg-background border-l border-border flex flex-col items-center justify-center p-6 text-center shrink-0 h-full max-h-full overflow-hidden">
        <p className="text-sm text-muted-foreground">{t('select_node_to_edit')}</p>
      </aside>
    );
  }

  const handleSave = () => {
    let dataToSave: any = { label };

    if (selectedNode.type === 'message' || selectedNode.type === 'collect' || selectedNode.type === 'options') {
       dataToSave.label = label;
    }

    if (selectedNode.type === 'options') dataToSave.options = options;
    if (selectedNode.type === 'delay') dataToSave.seconds = seconds;
    if (selectedNode.type === 'collect') {
      dataToSave.variable = variable;
    }

    if (selectedNode.type === 'save_contact') {
      dataToSave.nameVariable = saveNameVar;
      dataToSave.agentId = saveAgentId;
      dataToSave.departmentId = saveDepartmentId;
      dataToSave.tagId = saveTagId;
      dataToSave.funnelStageId = saveFunnelId;
      dataToSave.customFields = saveCustomFields;
    }

    if (selectedNode.type === 'start') {
      dataToSave = {
        ...dataToSave,
        triggerType,
        keywords,
        conditions: {
          funnelStageId: conditionStage !== 'null' ? conditionStage : undefined,
          tagId: conditionTag !== 'null' ? conditionTag : undefined,
          assignedUserId: conditionAgent !== 'null' ? conditionAgent : undefined,
          departmentId: conditionDepartment !== 'null' ? conditionDepartment : undefined,
        }
      };
    }

    if (selectedNode.type === 'media') {
      dataToSave.mediaUrl = mediaUrl;
      dataToSave.mediaType = mediaType;
      dataToSave.caption = mediaCaption;
      dataToSave.fileName = fileName;
    }

    if (['button_message', 'list_message', 'call_to_action'].includes(selectedNode.type || '')) {
      dataToSave.title = title;
      dataToSave.bodyText = bodyText;
      dataToSave.footerText = footerText;
      dataToSave.buttonText = buttonText;
    }

    if (selectedNode.type === 'button_message') {
      dataToSave.buttons = buttons;
    }

    if (selectedNode.type === 'list_message') {
      dataToSave.items = listItems;
    }

    if (selectedNode.type === 'call_to_action') {
      dataToSave.url = ctaUrl;
    }

    if (selectedNode.type === 'ai_control') {
      dataToSave.action = aiAction;
    }

    if (selectedNode.type === 'condition') {
      dataToSave.conditions = conditions;
    }

    onUpdateNode(selectedNode.id, dataToSave);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch('/api/automation/upload', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (data.url) {
            setMediaUrl(data.url);
            setFileName(data.filename);
            
            const mime = data.mimetype || '';
            if(mime.startsWith('image')) setMediaType('image');
            else if(mime.startsWith('video')) setMediaType('video');
            else if(mime.startsWith('audio')) setMediaType('audio');
            else setMediaType('document');
        }
    } catch (err) {
        console.error(err);
    } finally {
        setIsUploading(false);
    }
  };

  const addKeyword = () => { if (keywordInput.trim() && !keywords.includes(keywordInput.trim())) { setKeywords([...keywords, keywordInput.trim()]); setKeywordInput(''); } };
  const removeKeyword = (k: string) => { setKeywords(keywords.filter(kw => kw !== k)); };
  
  const addOption = () => setOptions([...options, `Option ${options.length + 1}`]);
  const removeOption = (index: number) => setOptions(options.filter((_, i) => i !== index));
  const updateOption = (index: number, value: string) => { const newOptions = [...options]; newOptions[index] = value; setOptions(newOptions); };

  const addButton = () => {
    if (buttons.length >= 3) return;
    setButtons([...buttons, { id: Date.now().toString(), text: '', value: '' }]);
  };
  const removeButton = (idx: number) => setButtons(buttons.filter((_, i) => i !== idx));
  const updateButton = (idx: number, field: string, val: string) => {
    const newBtns = [...buttons];
    // @ts-ignore
    newBtns[idx][field] = val;
    setButtons(newBtns);
  };

  const addListItem = () => {
    if (listItems.length >= 10) return;
    setListItems([...listItems, { id: Date.now().toString(), title: '', description: '', rowId: '' }]);
  };
  const removeListItem = (idx: number) => setListItems(listItems.filter((_, i) => i !== idx));
  const updateListItem = (idx: number, field: string, val: string) => {
    const newItems = [...listItems];
    // @ts-ignore
    newItems[idx][field] = val;
    setListItems(newItems);
  };

  const addCondition = () => {
    setConditions([...conditions, { id: `cond-${Date.now()}`, type: 'text', operator: 'equals', value: '' }]);
  };
  const removeCondition = (idx: number) => setConditions(conditions.filter((_, i) => i !== idx));
  const updateCondition = (idx: number, field: string, val: string) => {
    const newConds = [...conditions];
    // @ts-ignore
    newConds[idx][field] = val;
    setConditions(newConds);
  };

  return (
    <aside className="w-80 bg-background border-l border-border flex flex-col shrink-0 h-full max-h-full overflow-hidden">
      <div className="p-4 border-b border-border flex justify-between items-center bg-muted/30 shrink-0">
        <h2 className="font-semibold text-sm">{t('properties_title')}</h2>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-6 custom-scrollbar">
        
        {(selectedNode.type === 'message' || selectedNode.type === 'options' || selectedNode.type === 'collect') && (
          <div className="space-y-2">
            <Label>{selectedNode.type === 'collect' ? t('question_label') : t('message_text_label')}</Label>
            <Textarea rows={4} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('type_placeholder')} className="resize-none" />
          </div>
        )}

        {selectedNode.type === 'ai_control' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('action_label')}</Label>
              <Select value={aiAction} onValueChange={setAiAction}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t('enable_ai_select')}</SelectItem>
                  <SelectItem value="paused">{t('disable_pause_ai_select')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t('control_ai_agent_desc')}</p>
            </div>
          </div>
        )}

        {selectedNode.type === 'condition' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <Label>{t('ConditionProperties.title')}</Label>
              <Button variant="outline" size="sm" onClick={addCondition} className="h-7 text-xs">
                <Plus className="h-3 w-3 mr-1" /> {t('ConditionProperties.add_condition_btn')}
              </Button>
            </div>
            
            <div className="space-y-3">
              {conditions.map((cond, idx) => (
                <div key={idx} className="p-3 bg-muted/40 rounded border border-border space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-muted-foreground">{t('ConditionProperties.condition_label', { number: idx + 1 })}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeCondition(idx)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px]">{t('ConditionProperties.type_label')}</Label>
                    <Select value={cond.type} onValueChange={(v) => updateCondition(idx, 'type', v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">{t('ConditionProperties.types.text')}</SelectItem>
                        <SelectItem value="number">{t('ConditionProperties.types.number')}</SelectItem>
                        <SelectItem value="time">{t('ConditionProperties.types.time')}</SelectItem>
                        <SelectItem value="variable">{t('ConditionProperties.types.variable')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px]">{t('ConditionProperties.operator_label')}</Label>
                    <Select value={cond.operator} onValueChange={(v) => updateCondition(idx, 'operator', v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {cond.type === 'text' || cond.type === 'variable' ? (
                          <>
                            <SelectItem value="equals">{t('ConditionProperties.operators.equals')}</SelectItem>
                            <SelectItem value="not_equals">{t('ConditionProperties.operators.not_equals')}</SelectItem>
                            <SelectItem value="contains">{t('ConditionProperties.operators.contains')}</SelectItem>
                            <SelectItem value="starts_with">{t('ConditionProperties.operators.starts_with')}</SelectItem>
                            <SelectItem value="ends_with">{t('ConditionProperties.operators.ends_with')}</SelectItem>
                          </>
                        ) : (
                          <>
                            <SelectItem value="equals">{t('ConditionProperties.operators.equals')}</SelectItem>
                            <SelectItem value="greater_than">{t('ConditionProperties.operators.greater_than')}</SelectItem>
                            <SelectItem value="less_than">{t('ConditionProperties.operators.less_than')}</SelectItem>
                            <SelectItem value="gte">{t('ConditionProperties.operators.gte')}</SelectItem>
                            <SelectItem value="lte">{t('ConditionProperties.operators.lte')}</SelectItem>
                            <SelectItem value="between">{t('ConditionProperties.operators.between')}</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px]">{t('ConditionProperties.value_label')}</Label>
                    <Input 
                      value={cond.value} 
                      onChange={(e) => updateCondition(idx, 'value', e.target.value)} 
                      className="h-8 text-xs"
                      type={cond.type === 'time' ? 'time' : 'text'}
                      placeholder={cond.type === 'variable' ? t('ConditionProperties.variable_name_placeholder') : ''}
                    />
                  </div>

                   {cond.operator === 'between' && (
                     <div className="space-y-2">
                      <Label className="text-[10px]">{t('ConditionProperties.value2_label')}</Label>
                      <Input 
                        value={cond.value2 || ''} 
                        onChange={(e) => updateCondition(idx, 'value2', e.target.value)} 
                        className="h-8 text-xs"
                        type={cond.type === 'time' ? 'time' : 'text'}
                      />
                    </div>
                   )}
                </div>
              ))}
              
              {conditions.length === 0 && (
                  <div className="p-4 border border-dashed rounded text-center text-xs text-muted-foreground">
                      {t('ConditionProperties.else_label')}
                  </div>
              )}
            </div>
          </div>
        )}

        {selectedNode.type === 'list_message' && (
          <div className="space-y-4">
             <div className="space-y-2">
              <Label>{t('header_text_optional_label')}</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('header_text_placeholder')} />
            </div>
            <div className="space-y-2">
              <Label>{t('body_text_label')} <span className="text-destructive">*</span></Label>
              <Textarea rows={4} value={bodyText} onChange={(e) => setBodyText(e.target.value)} placeholder={t('body_text_placeholder')} className="resize-none" />
            </div>
            <div className="space-y-2">
              <Label>{t('footer_text_optional_label')}</Label>
              <Input value={footerText} onChange={(e) => setFooterText(e.target.value)} placeholder={t('footer_text_placeholder')} />
            </div>
            <div className="space-y-2">
              <Label>{t('button_text_label')} <span className="text-destructive">*</span></Label>
              <Input value={buttonText} onChange={(e) => setButtonText(e.target.value)} placeholder={t('button_text_placeholder')} maxLength={20} />
            </div>
            <div className="space-y-3 pt-4 border-t border-border">
                <div className="flex justify-between items-center">
                  <Label>{t('list_items_label', { count: listItems.length })}</Label>
                  <Button variant="outline" size="sm" onClick={addListItem} disabled={listItems.length >= 10} className="h-7 text-xs">
                    <Plus className="h-3 w-3 mr-1" /> {t('add_item_btn')}
                  </Button>
                </div>
                <div className="space-y-3">
                  {listItems.map((item, idx) => (
                    <div key={idx} className="space-y-2 p-3 bg-muted/50 rounded border border-border">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold">{t('item_x_span', { count: idx + 1})}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeListItem(idx)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                      <Input placeholder={t('item_title_placeholder')} value={item.title} onChange={(e) => updateListItem(idx, 'title', e.target.value)} className="h-8 text-xs" maxLength={24} />
                      <Input placeholder={t('description_optional_placeholder')} value={item.description} onChange={(e) => updateListItem(idx, 'description', e.target.value)} className="h-8 text-xs" maxLength={72} />
                      <Input placeholder={t('row_id_unique_placeholder')} value={item.rowId} onChange={(e) => updateListItem(idx, 'rowId', e.target.value)} className="h-8 text-xs" />
                    </div>
                  ))}
                </div>
            </div>
          </div>
        )}

        {selectedNode.type === 'call_to_action' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('header_optional_label')}</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('enter_header_text_placeholder')} />
            </div>
            <div className="space-y-2">
              <Label>{t('value_text_label')} <span className="text-destructive">*</span></Label>
              <Textarea rows={4} value={bodyText} onChange={(e) => setBodyText(e.target.value)} placeholder={t('enter_value_text_placeholder')} className="resize-none" />
            </div>
            <div className="space-y-2">
              <Label>{t('button_text_label')} <span className="text-destructive">*</span></Label>
              <Input value={buttonText} onChange={(e) => setButtonText(e.target.value)} placeholder={t('click_here_placeholder')} maxLength={20} />
            </div>
            <div className="space-y-2">
              <Label>{t('button_link_label')} <span className="text-destructive">*</span></Label>
              <Input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder={t('enter_url_placeholder')} />
            </div>
            <div className="space-y-2">
              <Label>{t('footer_optional_label')}</Label>
              <Input value={footerText} onChange={(e) => setFooterText(e.target.value)} placeholder={t('enter_footer_text_placeholder')} />
            </div>
          </div>
        )}

        {selectedNode.type === 'button_message' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('message_text_required_label')} <span className="text-destructive">*</span></Label>
              <Textarea rows={4} value={bodyText} onChange={(e) => setBodyText(e.target.value)} placeholder={t('enter_message_text_placeholder')} className="resize-none" />
            </div>
             <div className="space-y-2">
              <Label>{t('footer_optional_label')}</Label>
              <Input value={footerText} onChange={(e) => setFooterText(e.target.value)} placeholder={t('enter_footer_text_placeholder')} />
            </div>
            <div className="space-y-3 pt-4 border-t border-border">
                <div className="flex justify-between items-center">
                  <Label>{t('buttons_label', { count: buttons.length })}</Label>
                  <Button variant="outline" size="sm" onClick={addButton} disabled={buttons.length >= 3} className="h-7 text-xs">
                    <Plus className="h-3 w-3 mr-1" /> {t('add_button_btn')}
                  </Button>
                </div>
                <div className="space-y-3">
                  {buttons.map((btn, idx) => (
                    <div key={idx} className="space-y-2 p-3 bg-muted/50 rounded border border-border">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold">{t('button_x_span', { count: idx + 1})}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeButton(idx)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                      <div className="space-y-1">
                         <Label className="text-[10px] text-muted-foreground">{t('button_text_required_label')}</Label>
                        <Input placeholder={t('button_text_max_chars_placeholder')} value={btn.text} onChange={(e) => updateButton(idx, 'text', e.target.value)} className="h-8 text-xs" maxLength={20} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">{t('value_required_label')}</Label>
                        <Input placeholder={t('payload_value_placeholder')} value={btn.value} onChange={(e) => updateButton(idx, 'value', e.target.value)} className="h-8 text-xs" />
                      </div>
                    </div>
                  ))}
                </div>
            </div>
          </div>
        )}

        {selectedNode.type === 'media' && (
          <div className="space-y-4">
             <div className="space-y-2">
                <Label>{t('media_type_label')}</Label>
                <Select value={mediaType} onValueChange={setMediaType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="image">{t('image_select_item')}</SelectItem>
                    <SelectItem value="video">{t('video_select_item')}</SelectItem>
                    <SelectItem value="audio">{t('audio_select_item')}</SelectItem>
                    <SelectItem value="document">{t('document_select_item')}</SelectItem>
                  </SelectContent>
                </Select>
             </div>

             <div className="space-y-2">
                <Label>{t('file_upload_label')}</Label>
                <div className="flex items-center justify-center w-full">
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            {isUploading ? <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /> : <UploadCloud className="h-8 w-8 text-muted-foreground mb-2" />}
                            <p className="text-xs text-muted-foreground">
                                {fileName ? fileName : t('click_to_upload_placeholder')}
                            </p>
                        </div>
                        <input type="file" className="hidden" onChange={handleFileUpload} />
                    </label>
                </div>
             </div>

             {mediaType !== 'audio' && (
                  <div className="space-y-2">
                    <Label>{t('caption_label')}</Label>
                    <Input value={mediaCaption} onChange={(e) => setMediaCaption(e.target.value)} placeholder={t('optional_caption_placeholder')} />
                 </div>
             )}
          </div>
        )}

        {selectedNode.type === 'collect' && (
          <div className="space-y-2 pt-2 border-t border-border">
            <Label>{t('variable_name_label')}</Label>
            <Input 
              value={variable} 
              onChange={(e) => setVariable(e.target.value)} 
              placeholder={t('variable_name_placeholder')}
            />
            <p className="text-xs text-muted-foreground">{t('save_user_answer_desc')}</p>
          </div>
        )}

        {selectedNode.type === 'save_contact' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('name_variable_label')}</Label>
              <Input 
                value={saveNameVar} 
                onChange={(e) => setSaveNameVar(e.target.value)} 
                placeholder="Name or {{variable}}"
              />
              <p className="text-xs text-muted-foreground">{t('variable_to_use_contact_name_desc')}</p>
            </div>
            <div className="space-y-2">
                <Label>{t('assign_to_agent_label')}</Label>
                <Select value={saveAgentId} onValueChange={setSaveAgentId}>
                  <SelectTrigger><SelectValue placeholder={t('no_change_select')} /></SelectTrigger>
                  <SelectContent><SelectItem value="null">{t('no_change_select')}</SelectItem>{agents?.map((a: any) => <SelectItem key={a.id} value={a.id.toString()}>{a.name || a.email}</SelectItem>)}</SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
                <Label>{t('assign_to_department_label')}</Label>
                <Select value={saveDepartmentId} onValueChange={setSaveDepartmentId}>
                  <SelectTrigger><SelectValue placeholder={t('no_change_select')} /></SelectTrigger>
                  <SelectContent><SelectItem value="null">{t('no_change_select')}</SelectItem>{departmentsList?.map((d: any) => <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
                <Label>{t('set_funnel_stage_label')}</Label>
                <Select value={saveFunnelId} onValueChange={setSaveFunnelId}>
                  <SelectTrigger><SelectValue placeholder={t('no_change_select')} /></SelectTrigger>
                  <SelectContent><SelectItem value="null">{t('no_change_select')}</SelectItem>{funnelStages?.map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
                <Label>{t('add_tag_label')}</Label>
                <Select value={saveTagId} onValueChange={setSaveTagId}>
                  <SelectTrigger><SelectValue placeholder={t('no_change_select')} /></SelectTrigger>
                  <SelectContent><SelectItem value="null">{t('no_change_select')}</SelectItem>{tags?.map(t => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
            </div>

            {customFields && customFields.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-border">
                    <Label className="text-sm font-semibold text-muted-foreground uppercase">{t('custom_fields_title')}</Label>
                    <div className="space-y-3">
                        {customFields.map((cf: any) => (
                            <div key={cf.id} className="space-y-1">
                                <Label className="text-xs font-normal">{cf.name}</Label>
                                <Input 
                                    value={saveCustomFields[cf.key] || ''} 
                                    onChange={(e) => setSaveCustomFields(prev => ({ ...prev, [cf.key]: e.target.value }))}
                                    placeholder={cf.type === 'boolean' ? "true/false or {{var}}" : "Value or {{var}}"}
                                    className="h-8 text-xs"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}
          </div>
        )}

        {selectedNode.type === 'delay' && (
          <div className="space-y-3">
            <Label>{t('wait_duration_label')}</Label>
            <div className="flex items-center gap-2">
              <Input type="number" min={1} max={60} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} />
              <span className="text-sm text-muted-foreground">{t('sec_label')}</span>
            </div>
          </div>
        )}

        {selectedNode.type === 'options' && (
          <div className="space-y-3 pt-4 border-t border-border">
            <div className="flex justify-between items-center"><Label>{t('menu_options_label')}</Label><Button variant="outline" size="sm" onClick={addOption} className="h-7 text-xs"><Plus className="h-3 w-3 mr-1" /> {t('add_option_btn')}</Button></div>
            <div className="space-y-2">{options.map((opt, idx) => (<div key={idx} className="flex gap-2"><Input value={opt} onChange={(e) => updateOption(idx, e.target.value)} className="h-8 text-sm" /><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeOption(idx)}><Trash2 className="h-3 w-3" /></Button></div>))}</div>
          </div>
        )}

        {selectedNode.type === 'start' && (
          <div className="space-y-6">
            <div className="space-y-3"><Label>{t('trigger_type_label')}</Label><Select value={triggerType} onValueChange={setTriggerType}><SelectTrigger><SelectValue placeholder={t('any_select')} /></SelectTrigger><SelectContent><SelectItem value="exact_match">{t('exact_match_select')}</SelectItem><SelectItem value="contains">{t('message_contains_select')}</SelectItem><SelectItem value="first_message">{t('first_message_select')}</SelectItem><SelectItem value="fallback">{t('fallback_select')}</SelectItem></SelectContent></Select></div>
            {['exact_match', 'contains'].includes(triggerType) && (<div className="space-y-3"><Label>{t('keywords_label')}</Label><div className="flex gap-2"><Input value={keywordInput} onChange={(e) => setKeywordInput(e.target.value)} placeholder={t('add_keyword_placeholder')} onKeyDown={(e) => e.key === 'Enter' && addKeyword()} /><Button size="icon" onClick={addKeyword} variant="secondary"><Plus className="h-4 w-4" /></Button></div><div className="flex flex-wrap gap-2 mt-2">{keywords.map(k => (<Badge key={k} variant="outline" className="gap-1 pr-1">{k}<X className="h-3 w-3 cursor-pointer text-muted-foreground hover:text-destructive" onClick={() => removeKeyword(k)}/></Badge>))}</div></div>)}
            <div className="space-y-4 pt-4 border-t border-border"><h3 className="text-sm font-medium text-foreground">{t('conditions_title')}</h3><div className="space-y-2"><Label className="text-xs text-muted-foreground">{t('stage_label')}</Label><Select value={conditionStage} onValueChange={setConditionStage}><SelectTrigger><SelectValue placeholder={t('any_select')} /></SelectTrigger><SelectContent><SelectItem value="null">{t('any_select')}</SelectItem>{funnelStages?.map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label className="text-xs text-muted-foreground">{t('tag_label')}</Label><Select value={conditionTag} onValueChange={setConditionTag}><SelectTrigger><SelectValue placeholder={t('any_select')} /></SelectTrigger><SelectContent><SelectItem value="null">{t('any_select')}</SelectItem>{tags?.map(t => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label className="text-xs text-muted-foreground">{t('agent_label')}</Label><Select value={conditionAgent} onValueChange={setConditionAgent}><SelectTrigger><SelectValue placeholder={t('any_select')} /></SelectTrigger><SelectContent><SelectItem value="null">{t('any_select')}</SelectItem>{agents?.map((a: any) => <SelectItem key={a.id} value={a.id.toString()}>{a.name || a.email}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label className="text-xs text-muted-foreground">{t('department_label')}</Label><Select value={conditionDepartment} onValueChange={setConditionDepartment}><SelectTrigger><SelectValue placeholder={t('any_select')} /></SelectTrigger><SelectContent><SelectItem value="null">{t('any_select')}</SelectItem>{departmentsList?.map((d: any) => <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>)}</SelectContent></Select></div></div>
          </div>
        )}

        {selectedNode.type === 'end' && (
            <div className="p-4 bg-muted/30 rounded text-xs text-center text-muted-foreground">
                {t('end_node_desc')}
            </div>
        )}
      </div>

      <div className="p-4 border-t border-border bg-muted/30 shrink-0">
        <Button className="w-full" onClick={handleSave}><Save className="h-4 w-4 mr-2" /> {t('save_changes_btn')}</Button>
      </div>
    </aside>
  );
}