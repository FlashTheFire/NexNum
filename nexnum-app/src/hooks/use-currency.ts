"use client";

import { useEffect, useState, useCallback } from 'react';
import Cookies from 'js-cookie';

export interface Currency {
    code: string;
    name: string;
    symbol: string;
    rate: number;
}

const DEFAULT_CURRENCY: Currency = {
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    rate: 1,
};

export function useCurrency() {
    const [activeCurrency, setActiveCurrency] = useState<Currency>(DEFAULT_CURRENCY);
    const [currencies, setCurrencies] = useState<Currency[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Initial load
    useEffect(() => {
        const fetchCurrencies = async () => {
            try {
                const res = await fetch('/api/public/currency');
                const data = await res.json();

                // API returns { currencies: { USD: {...}, INR: {...} }, ... }
                const currencyList = Object.values(data.currencies) as Currency[];
                setCurrencies(currencyList);

                // Priority: Cookie > API Preferred > DEFAULT
                const savedCode = Cookies.get('nexnum-currency') || data.preferredCurrency;
                if (savedCode) {
                    const found = currencyList.find(c => c.code === savedCode);
                    if (found) setActiveCurrency(found);
                }
            } catch (err) {
                console.error('Failed to load currencies:', err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchCurrencies();
    }, []);

    const setCurrency = useCallback((code: string) => {
        const selected = currencies.find(c => c.code === code);
        if (selected) {
            setActiveCurrency(selected);
            Cookies.set('nexnum-currency', code, { expires: 365 });
            // Refresh to ensure SSR/Server Props pick up the new cookie
            window.location.reload();
        }
    }, [currencies]);

    /**
     * Format an internal COINS (integer) value to the active currency display
     * @param coins Internal price in subunits (e.g. 78)
     */
    const format = useCallback((coins: number) => {
        // 1. Convert COINS back to USD Base (cents -> dollars)
        const amountUSD = coins / 100;

        // 2. Convert to active currency
        const converted = amountUSD * activeCurrency.rate;

        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: activeCurrency.code,
        }).format(converted);
    }, [activeCurrency]);

    return {
        currency: activeCurrency,
        currencies,
        setCurrency,
        format,
        isLoading
    };
}
