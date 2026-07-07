def fibonacci(n):
    """Generate the first n Fibonacci numbers"""
    fib_sequence = []
    
    if n >= 1:
        fib_sequence.append(0)
    if n >= 2:
        fib_sequence.append(1)
    
    for i in range(2, n):
        next_fib = fib_sequence[i-1] + fib_sequence[i-2]
        fib_sequence.append(next_fib)
    
    return fib_sequence

# Calculate the first 20 Fibonacci numbers
fib_numbers = fibonacci(20)

print("The first 20 Fibonacci numbers are:")
for i, num in enumerate(fib_numbers, 1):
    print(f"F({i}): {num}")

print(f"\nSequence: {fib_numbers}")
