import React from 'react';
import { Card, Text } from '@radix-ui/themes';
import RawCodeMirror from './RawCodeMirror';

export interface RawTabProps {
	dialogueSource: string;
	onChange: (value: string) => void;
	rawLintErrors: Array<{ line: number; message: string }>;
	setRawLintErrors: (errs: Array<{ line: number; message: string }>) => void;
}

const RawTab: React.FC<RawTabProps> = ({ dialogueSource, onChange, rawLintErrors, setRawLintErrors }) => {
	const editorWrapRef = React.useRef<HTMLDivElement | null>(null);
	return (
		<Card data-raw-tab-root="1" size="2" variant="surface" style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0, overflow: 'hidden' }}>
			<div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
				<div ref={editorWrapRef} data-raw-scroll="1" style={{ height: '100%', minHeight: 0, position: 'relative', overflow: 'auto' }}>
					<RawCodeMirror value={dialogueSource} onChange={onChange} onDiagnostics={(errs) => setRawLintErrors(errs)} />
				</div>
			</div>
			<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 8, borderTop: '1px dashed var(--gray-a6)', paddingTop: 8 }}>
				{rawLintErrors.length > 0 ? (
					<div>
						<Text as="div" size="2" style={{ color: 'var(--red9)' }}>
							{rawLintErrors.length} problem{rawLintErrors.length === 1 ? '' : 's'}
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


