import React, { useRef, useEffect, useState } from 'react';
import { Card, Text, Button, Flex, Box } from '@radix-ui/themes';

interface StartupScreenProps {
  onOpenDatapack: () => void;
  onOpenRecent: (path: string) => void;
  recentPaths: Array<{ path: string; name: string; lastOpened: string }>;
  isLoading?: boolean;
}

const StartupScreen: React.FC<StartupScreenProps> = ({ 
  onOpenDatapack, 
  onOpenRecent, 
  recentPaths,
  isLoading = false
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [maxChars, setMaxChars] = useState(20);

  useEffect(() => {
    if (buttonRef.current) {
      const buttonWidth = buttonRef.current.offsetWidth;
      const halfWidth = buttonWidth / 2;
      // Estimate ~8px per character for monospace font
      const chars = Math.floor(halfWidth / 8);
      setMaxChars(chars);
    }
  }, []);

  return (
    <div style={{ 
      display: 'flex', 
      height: '100vh', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'var(--gray-a2)',
      padding: '16px'
    }}>
      <Card size="3" variant="surface" style={{ maxWidth: '500px', width: '100%' }}>
        <Flex direction="column" gap="4" align="center">
          <Text size="6" weight="bold" align="center">
            Stylized Tellraw Editor
          </Text>
          
          <Text size="3" color="gray" align="center">
            Welcome! Choose how you'd like to start your project:
          </Text>
          
          <Button 
            size="3" 
            variant="solid" 
            onClick={onOpenDatapack}
            disabled={isLoading}
            style={{ width: '100%', height: '48px' }}
            ref={buttonRef}
          >
            {isLoading ? 'Opening...' : 'Open datapack'}
          </Button>
          
          <Box style={{ width: '100%' }}>
            <Text size="2" weight="bold" color="gray" style={{ marginBottom: '12px', display: 'block' }}>
              Open Recent:
            </Text>
            
            {recentPaths.length > 0 ? (
              <Flex direction="column" gap="2">
                {recentPaths.slice(0, 5).map((recent, index) => (
                  <Button
                    key={index}
                    size="2"
                    variant="surface"
                    onClick={() => onOpenRecent(recent.path)}
                    disabled={isLoading}
                    style={{ 
                      width: '100%', 
                      justifyContent: 'flex-start',
                      textAlign: 'left',
                      padding: '12px 16px'
                    }}
                  >
                    <Flex justify="between" align="center" style={{ width: '100%' }}>
                      <Text size="2" weight="medium" style={{ color: 'var(--gray-12)' }}>
                        {recent.name}
                      </Text>
                      <Text size="1" color="gray" style={{ flex: 1, textAlign: 'right', fontSize: '0.75rem' }}>
                        {(() => {
                          // Remove the last folder (project directory) from any path
                          const parts = recent.path.split('/');
                          parts.pop(); // Remove the last folder (project directory)
                          const cleanPath = parts.join('/');
                          
                          // Calculate where to place "..." so the text fits in half the button width
                          return cleanPath.length > maxChars ? `...${cleanPath.slice(-maxChars)}` : `...${cleanPath}`;
                        })()}
                      </Text>
                    </Flex>
                  </Button>
                ))}
              </Flex>
            ) : (
              <Text size="2" color="gray" align="center" style={{ fontStyle: 'italic' }}>
                No recent datapacks
              </Text>
            )}
          </Box>
        </Flex>
      </Card>
    </div>
  );
};

export default StartupScreen;
