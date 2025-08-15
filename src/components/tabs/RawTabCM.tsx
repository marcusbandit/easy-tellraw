import React, { useState } from 'react';
import { Card, Text, Tabs } from '@radix-ui/themes';
import RawCodeMirror from './RawCodeMirror';

export interface RawTabProps {
	dialogueSource: string;
	combinedDialogueSource: string;
	tellrawFiles: Array<{ name: string; fullName: string; path: string; isStyles: boolean }>;
	activeFileIndex: number;
	onChange: (value: string) => void;
	onSwitchFile: (fileIndex: number) => void;
	rawLintErrors: Array<{ line: number; message: string; fileIndex?: number }>;
	setRawLintErrors: (errs: Array<{ line: number; message: string; fileIndex?: number }>) => void;
	stylesContent?: string; // Content from Style.txt for reference validation
}

const RawTab: React.FC<RawTabProps> = ({ 
	dialogueSource, 
	combinedDialogueSource, 
	tellrawFiles,
	activeFileIndex,
	onChange, 
	onSwitchFile,
	rawLintErrors, 
	setRawLintErrors,
	stylesContent
}) => {
	const editorWrapRef = React.useRef<HTMLDivElement | null>(null);
	const [activeTab, setActiveTab] = useState<string>('combined');
	
	// Sync tab with active file
	React.useEffect(() => {
		if (tellrawFiles.length > 0 && activeFileIndex >= 0) {
			setActiveTab(`file-${activeFileIndex}`);
		}
	}, [activeFileIndex, tellrawFiles.length]);
	
	// Filter lint errors for the current file
	const currentFileErrors = tellrawFiles.length > 0 ? rawLintErrors.filter(error => 
		error.fileIndex === undefined || error.fileIndex === activeFileIndex
	) : rawLintErrors.filter(error => error.fileIndex === undefined); // Show general errors even without files
	
	// Handle tab change
	const handleTabChange = (value: string) => {
		setActiveTab(value);
		if (value.startsWith('file-')) {
			const fileIndex = parseInt(value.replace('file-', ''));
			onSwitchFile(fileIndex);
		}
	};
	
	return (
		<Card data-raw-tab-root="1" size="2" variant="surface" style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0, overflow: 'hidden' }}>
			<Tabs.Root value={activeTab} onValueChange={handleTabChange} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
				<Tabs.List>
					<Tabs.Trigger value="combined">Combined</Tabs.Trigger>
					{tellrawFiles.length > 0 && tellrawFiles.map((file, index) => (
						<Tabs.Trigger 
							key={file.fullName} 
							value={`file-${index}`}
						>
							{file.name}
						</Tabs.Trigger>
					))}
				</Tabs.List>
				
				<Tabs.Content value="combined" style={{ flex: 1, minHeight: 0, height: '100%' }}>
					<div style={{ padding: '8px', borderBottom: '1px solid var(--gray-a6)', backgroundColor: 'var(--gray-a1)' }}>
						<Text size="2" color="gray">Read-only view of all combined files</Text>
					</div>
					<div style={{ height: 'calc(100% - 40px)', overflow: 'auto' }}>
						<RawCodeMirror 
							value={combinedDialogueSource || 'No combined content available'} 
							onChange={() => {}} // Read-only
							onDiagnostics={() => {}} // No diagnostics for read-only
							readOnly={true}
							stylesContent={stylesContent}
						/>
					</div>
				</Tabs.Content>
				
				{tellrawFiles.length > 0 && tellrawFiles.map((file, index) => (
					<Tabs.Content key={file.fullName} value={`file-${index}`} style={{ flex: 1, minHeight: 0, height: '100%' }}>
						<div style={{ padding: '8px', borderBottom: '1px solid var(--gray-a6)', backgroundColor: 'var(--gray-a1)' }}>
							<Text size="2" color="gray">
								{file.isStyles ? 'Styles file' : 'Dialogue file'}: {file.name}
							</Text>
						</div>
						<div ref={index === activeFileIndex ? editorWrapRef : undefined} style={{ height: 'calc(100% - 40px)', overflow: 'auto' }}>
							<RawCodeMirror 
								value={dialogueSource} 
								onChange={onChange} 
								onDiagnostics={() => {}} // No diagnostics for read-only
								readOnly={false}
								stylesContent={stylesContent}
							/>
						</div>
					</Tabs.Content>
				))}
			</Tabs.Root>
			
			<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 8, borderTop: '1px dashed var(--gray-a6)', paddingTop: 8 }}>
				{currentFileErrors.length > 0 ? (
					<div>
						<Text as="div" size="2" style={{ color: 'var(--red9)' }}>
							{currentFileErrors.length} problem{currentFileErrors.length === 1 ? '' : 's'}
						</Text>
					</div>
				) : (
					<div />
				)}
			</div>
		</Card>
	);
}

export default RawTab;


